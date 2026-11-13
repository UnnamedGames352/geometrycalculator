import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  adminLogin,
  checkAdminAccess,
  checkAdminAccessServer,
  globalPanic,
  clearActivity,
  getActivity,
  saveSettings,
  updateFriend,
  createCode,
  createFriend,
  deleteCode,
  deleteFriend,
  listCodes,
  listFriends,
  lockAdmin,
  listBans,
  setBan,
  messageFriend,
} from "@/lib/gate.functions";
import { getBrowserDeviceId, isFriendOnline, DEVICE_ID_PATTERN, creditSeconds, formatDuration, topGame } from "@/lib/security-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Activity, Ban, Check, ChevronRight, Copy, Gamepad2, KeyRound, LayoutDashboard, LockKeyhole, Search, Shield, Users, X } from "lucide-react";
import { kickFriend } from "@/lib/kick.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [
    { title: "Resource Administration | Geometry Resources" },
    { name: "description", content: "The requested page could not be found." },
    { property: "og:title", content: "Resource Administration | Geometry Resources" },
    { property: "og:description", content: "The requested page could not be found." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  loader: async () => {
    const { allowed } = await checkAdminAccessServer();
    if (!allowed) throw redirect({ to: "/geometry" });
    const [codes, friends, activity, bans] = await Promise.all([listCodes(), listFriends(), getActivity(), listBans()]);
    return { ...codes, ...friends, ...activity, ...bans };
  },
  component: Admin,
});

const when = (t: string | null) => t ? new Date(t).toLocaleString() : "Never";
const btn = "rounded border border-border px-2 py-1 text-xs hover:bg-accent";
const tabs = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "players", label: "Player roster", icon: Gamepad2 },
  { id: "friends", label: "Friend accounts", icon: Users },
  { id: "access", label: "Access codes", icon: KeyRound },
  { id: "security", label: "Security & bans", icon: Shield },
  { id: "activity", label: "Activity audit", icon: Activity },
] as const;
type AdminTab = typeof tabs[number]["id"];
type Friend = ReturnType<typeof Route.useLoaderData>["friends"][number];
type Editor =
  | { kind: "add"; name: string }
  | { kind: "rename" | "password" | "expiry" | "message" | "note"; friend: Friend; value: string; random?: boolean };
type ConfirmAction = { title: string; description: string; label: string; run: () => Promise<void> };
type ActivityFilter = "all" | "failed" | "success" | "admin";
type RosterFilter = "all" | "playing" | "hub" | "offline" | "banned";

function Admin() {
  const { admin, codes, friends, log, settings, bans } = Route.useLoaderData();
  const router = useRouter();
  const ban = useServerFn(setBan);
  const panic = useServerFn(globalPanic);
  const access = useServerFn(checkAdminAccess);
  const note = useServerFn(messageFriend);
  const addFriend = useServerFn(createFriend);
  const removeFriend = useServerFn(deleteFriend);
  const kick = useServerFn(kickFriend);
  const editFriend = useServerFn(updateFriend);
  const save = useServerFn(saveSettings);
  const clearLog = useServerFn(clearActivity);
  const make = useServerFn(createCode);
  const removeCode = useServerFn(deleteCode);
  const lock = useServerFn(lockAdmin);
  const [accessOk, setAccessOk] = useState(false);
  const [tabOk, setTabOk] = useState<boolean | null>(null);
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [banId, setBanId] = useState("");
  const [codeBatch, setCodeBatch] = useState("1");
  const [codeSearch, setCodeSearch] = useState("");
  const [rosterSearch, setRosterSearch] = useState("");
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [visiblePasswords, setVisiblePasswords] = useState<string[]>([]);

  useEffect(() => {
    access({ data: { deviceId: getBrowserDeviceId() } }).then((result) => {
      if (!result.allowed) void router.navigate({ to: "/geometry" });
      else setAccessOk(true);
    }).catch(() => { void router.navigate({ to: "/geometry" }); });
  }, []);
  useEffect(() => {
    const ok = sessionStorage.getItem("admin-tab") === "1";
    setTabOk(ok);
    if (admin && !ok) lock().then(() => router.invalidate());
  }, [admin]);
  useEffect(() => {
    if (!admin || !tabOk) return;
    const id = setInterval(() => router.invalidate(), 5000);
    return () => clearInterval(id);
  }, [admin, tabOk]);

  if (!accessOk || (admin && tabOk === null)) return null;
  if (!admin || !tabOk) return <AdminGate />;

  const refresh = () => router.invalidate();
  const onlineFriends = friends.filter((f) => isFriendOnline(f, Date.now()));
  const playingFriends = onlineFriends.filter((f) => f.current_game);
  const hubFriends = onlineFriends.filter((f) => !f.current_game);
  const failureCount = log.filter((entry) => ["wrong", "admin_wrong", "blocked", "tripwire"].includes(entry.kind)).length;
  const bannedIds = new Set(bans.map((item) => item.device_id));
  const tripwireAlert = log.find((entry) => entry.kind === "tripwire" || /Lockdown Active: Non-Chromebook attempt blocked at/i.test(entry.detail));
  const autoBanAlert = log.some((entry) => /Auto-ban: 3 failed attempts within 5 minutes/i.test(entry.detail));
  const filteredRoster = friends.filter((f) => {
    const query = rosterSearch.trim().toLowerCase();
    const matchesText = !query || [f.name, f.device_id, f.current_game].some((value) => value?.toLowerCase().includes(query));
    const online = isFriendOnline(f, Date.now());
    const matchesState = rosterFilter === "all" || (rosterFilter === "playing" && online && !!f.current_game)
      || (rosterFilter === "hub" && online && !f.current_game) || (rosterFilter === "offline" && !online)
      || (rosterFilter === "banned" && !!f.device_id && bannedIds.has(f.device_id));
    return matchesText && matchesState;
  });
  const filteredCodes = codes.filter((code) => code.toLowerCase().includes(codeSearch.toLowerCase().trim()));
  const filteredLog = log.filter((entry) => activityFilter === "all"
    || (activityFilter === "failed" && ["wrong", "admin_wrong", "blocked", "tripwire"].includes(entry.kind))
    || (activityFilter === "success" && ["code", "login", "admin_login"].includes(entry.kind))
    || (activityFilter === "admin" && entry.kind === "admin_login"));

  async function perform(label: string, operation: () => Promise<unknown>) {
    try {
      await operation();
      toast.success(label);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The action could not be completed.");
    }
  }
  function ask(title: string, description: string, label: string, run: () => Promise<void>) {
    setConfirmAction({ title, description, label, run });
  }
  function openEditor(next: Editor) { setEditor(next); }
  async function saveEditor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    try {
      if (editor.kind === "add") {
        await addFriend({ data: { name: editor.name.trim() } });
        toast.success("Friend account created");
      } else if (editor.kind === "message") {
        await note({ data: { id: editor.friend.id, message: editor.value } });
        toast.success("Message sent");
      } else {
        let patch: Omit<Parameters<typeof editFriend>[0]["data"], "id">;
        if (editor.kind === "rename") patch = { name: editor.value };
        else if (editor.kind === "password") patch = editor.random ? { newRandom: true } : { password: editor.value };
        else if (editor.kind === "expiry") patch = { expires_at: editor.value ? new Date(editor.value).toISOString() : null };
        else patch = { admin_note: editor.value };
        const result = await editFriend({ data: { id: editor.friend.id, ...patch } });
        if (!result.ok) throw new Error("error" in result ? result.error : "Could not save changes");
        toast.success(editor.kind === "note" ? "Private note updated" : "Friend account updated");
      }
      setEditor(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The change could not be saved.");
    } finally { setSaving(false); }
  }
  async function banDevice(deviceId: string, noteText = "") {
    if (!DEVICE_ID_PATTERN.test(deviceId)) { toast.error("That browser ID is not a valid UUID."); return; }
    ask("Ban this browser ID?", "The browser will no longer be able to sign in with this ID. Browser IDs are resettable and do not identify hardware.", "Ban device", async () => {
      await ban({ data: { deviceId, note: noteText, banned: true } });
      toast.success("Browser ID banned");
      await refresh();
    });
  }
  async function generateCodes() {
    const count = Number(codeBatch);
    await perform(count === 1 ? "Access code created" : `${count} access codes created`, async () => {
      for (let i = 0; i < count; i++) await make();
    });
  }
  async function copyText(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); toast.success(label); }
    catch { toast.error("Clipboard access was unavailable."); }
  }
  async function messageOnlineFriends(template: string) {
    const targets = onlineFriends.map((friend) => friend.id);
    if (!targets.length) { toast.error("No players are currently online."); return; }
    await Promise.all(targets.map((id) => note({ data: { id, message: template } })));
    toast.success(`Sent message to ${targets.length} online player${targets.length === 1 ? "" : "s"}`);
    await refresh();
  }
  async function kickOnlineFriends() {
    const targets = onlineFriends.map((friend) => friend.id);
    if (!targets.length) { toast.error("No players are currently online."); return; }
    await Promise.all(targets.map((id) => kick({ data: { id } })));
    toast.success(`Kicked ${targets.length} online player${targets.length === 1 ? "" : "s"}`);
    await refresh();
  }
  async function pauseOnlineFriends() {
    const targets = onlineFriends.map((friend) => friend.id);
    if (!targets.length) { toast.error("No players are currently online."); return; }
    await Promise.all(targets.map((id) => editFriend({ data: { id, paused: true } })));
    toast.success(`Paused ${targets.length} online player${targets.length === 1 ? "" : "s"}`);
    await refresh();
  }
  async function broadcastToAll(message: string) {
    if (!friends.length) { toast.error("No friend accounts exist yet."); return; }
    await Promise.all(friends.map((friend) => note({ data: { id: friend.id, message } })));
    toast.success(`Broadcast sent to ${friends.length} accounts`);
    await refresh();
  }
  async function resetAllSessions() {
    if (!friends.length) { toast.error("No active sessions to clear."); return; }
    await Promise.all(friends.map((friend) => kick({ data: { id: friend.id } })));
    toast.success("All stored sessions have been cleared");
    await refresh();
  }
  function scheduleLockdown(minutes: number) {
    const ms = minutes * 60_000;
    toast.info(`${minutes}-minute auto-lock armed`);
    window.setTimeout(() => {
      void (async () => {
        await save({ data: { lockdown: true } });
        toast.success("Lockdown activated automatically");
        await refresh();
      })();
    }, ms);
  }

  const panelTitle = tabs.find((item) => item.id === tab)?.label ?? "Overview";
  return <main className="mx-auto min-h-screen max-w-[1500px] bg-background px-4 py-6 text-foreground sm:px-7 lg:px-10">
    {(tripwireAlert || autoBanAlert) && <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-destructive shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-destructive/15"><Shield className="h-4 w-4" /></span>
        <div>
          <p className="text-sm font-semibold">Security incident</p>
          <p className="text-sm text-destructive/90">{tripwireAlert ? tripwireAlert.detail : "Multiple device failures triggered an auto-ban.")}</p>
        </div>
      </div>
    </div>}
    <header className="sticky top-0 z-30 rounded-2xl border border-border bg-card/95 p-5 shadow-sm backdrop-blur sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Games hub · command center</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Site controls</h1><p className="mt-2 text-sm text-muted-foreground">Live player operations and access management.</p></div>
        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium ${settings.lockdown ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-success/30 bg-success/10 text-success"}`}><span className={`h-2.5 w-2.5 rounded-full ${settings.lockdown ? "bg-destructive" : "animate-pulse bg-success"}`} />{settings.lockdown ? "Lockdown active" : "Live · Synced"}</div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-5">
        <Button variant={settings.lockdown ? "outline" : "secondary"} onClick={() => settings.lockdown
          ? void perform("Lockdown disabled", () => save({ data: { lockdown: false } }))
          : ask("Enable lockdown?", "Players will lose access to the games hub until lockdown is disabled.", "Enable lockdown", async () => { await save({ data: { lockdown: true } }); toast.success("Lockdown enabled"); await refresh(); })}>
          <LockKeyhole className="mr-2 h-4 w-4" />{settings.lockdown ? "Disable lockdown" : "Enable lockdown"}
        </Button>
        <Button variant="destructive" onClick={() => ask("Global Panic", "This immediately signs out every player and sends them to Geometry. This cannot be undone.", "Kick everyone", async () => { await panic(); toast.success("All player sessions evicted"); await refresh(); })}>
          <X className="mr-2 h-4 w-4" />Global Panic
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-muted-foreground">Online players</div>
          <Button variant="outline" size="sm" onClick={() => void messageOnlineFriends("Teacher approaching — wrap up and return to the hub.")}>Message online</Button>
          <Button variant="outline" size="sm" onClick={() => void kickOnlineFriends()}>Kick online</Button>
          <Button variant="outline" size="sm" onClick={() => void pauseOnlineFriends()}>Pause online</Button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <div className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-muted-foreground">All accounts</div>
        <Button variant="outline" size="sm" onClick={() => void broadcastToAll("School-wide notice: please check the hub for the latest update.")}>Broadcast to all</Button>
        <Button variant="outline" size="sm" onClick={() => void resetAllSessions()}>Reset all sessions</Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Class bell auto-lock</span>
          {[15, 30, 45].map((minutes) => (
            <Button key={minutes} variant="secondary" size="sm" onClick={() => scheduleLockdown(minutes)}>{minutes}m</Button>
          ))}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <StatChip label="Friends" value={friends.length} icon={<Users className="h-4 w-4" />} />
        <StatChip label="Playing" value={playingFriends.length} icon={<Gamepad2 className="h-4 w-4" />} />
        <StatChip label="On hub" value={hubFriends.length} icon={<LayoutDashboard className="h-4 w-4" />} />
        <StatChip label="Unused codes" value={codes.length} icon={<KeyRound className="h-4 w-4" />} />
        <StatChip label="Active bans" value={bans.length} icon={<Ban className="h-4 w-4" />} />
      </div>
    </header>

    <nav aria-label="Admin sections" role="tablist" className="sticky top-[94px] z-20 mt-5 flex gap-2 overflow-x-auto rounded-xl border border-border bg-background/95 p-2 backdrop-blur">
      {tabs.map(({ id, label, icon: Icon }) => {
        const count = id === "players" ? friends.length : id === "friends" ? onlineFriends.length : id === "access" ? codes.length : id === "security" ? bans.length : id === "activity" ? failureCount : null;
        return <button key={id} id={`admin-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls="admin-panel" onClick={() => setTab(id)} onKeyDown={(event) => {
          if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const current = tabs.findIndex((item) => item.id === id);
          const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
          setTab(tabs[next]!.id);
          document.getElementById(`admin-tab-${tabs[next]!.id}`)?.focus();
        }} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${tab === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
          <Icon className="h-4 w-4" /><span>{label}</span>{count !== null && <span className={`rounded-full px-1.5 py-0.5 text-xs ${tab === id ? "bg-primary-foreground/15" : "bg-muted"}`}>{count}</span>}
        </button>;
      })}
    </nav>

    <section id="admin-panel" role="tabpanel" aria-labelledby={`admin-tab-${tab}`} className="mt-5 min-h-[420px] rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="mb-6 flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Workspace</p><h2 className="mt-1 text-2xl font-bold">{panelTitle}</h2></div><ChevronRight className="h-5 w-5 text-muted-foreground" /></div>

      {tab === "dashboard" && <>
        <section aria-label="Live site statistics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="Friends online" value={onlineFriends.length} detail="Active in the last 2 minutes" accent="text-success" />
          <StatCard label="Playing now" value={playingFriends.length} detail="Friends currently in a game" accent="text-chart-3" />
          <StatCard label="On the hub" value={hubFriends.length} detail="Online, not in a game" accent="text-chart-2" />
          <StatCard label="Unused codes" value={codes.length} detail="One-time codes ready to use" accent="text-chart-1" />
        </section>
        <section className="mt-7"><div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-semibold">Live players</h3><p className="mt-1 text-sm text-muted-foreground">Current game and last-reported device. Browser IDs are not hardware identity.</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs">{onlineFriends.length} active</span></div>
          {onlineFriends.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No friends checked in during the last two minutes.</p> : <ul className="mt-4 grid gap-3 lg:grid-cols-2">{onlineFriends.map((f) => <li key={f.id} className="rounded-xl border border-border p-4 transition-colors hover:bg-muted/20"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{f.name || "(no name)"}</p><p className="mt-1 text-sm">{f.current_game ? <>Playing <strong>{f.current_game}</strong></> : "Browsing the games hub"}</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success"><span className="h-1.5 w-1.5 rounded-full bg-success"/>Online</span></div><div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>{f.device || "Device not reported"} · seen {when(f.last_seen)}</span>{f.device_id && <DeviceControls id={f.device_id} onBan={() => banDevice(f.device_id ?? "", f.name)} onCopy={() => copyText(f.device_id ?? "", "Browser ID copied")} />}</div></li>)}</ul>}
        </section>
      </>}

      {tab === "players" && <section><p className="mb-4 text-sm text-muted-foreground">Hardware values are browser-reported estimates; some browsers hide RAM or core counts. Admin notes are private.</p>
        <div className="mb-4 flex flex-wrap items-center gap-3"><label className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={rosterSearch} onChange={(event) => setRosterSearch(event.target.value)} placeholder="Search name, browser ID, or game" aria-label="Search player roster" className="pl-9"/></label><div className="flex flex-wrap gap-1.5">{(["all", "playing", "hub", "offline", "banned"] as const).map((filter) => <FilterPill key={filter} active={rosterFilter === filter} onClick={() => setRosterFilter(filter)}>{filter === "hub" ? "On hub" : filter[0]!.toUpperCase() + filter.slice(1)}</FilterPill>)}</div></div>
        <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[1350px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>{["Player", "Active state", "Hardware footprint", "Playtime stats", "Browser ID", "Admin note"].map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-4 py-3">{heading}</th>)}</tr></thead><tbody>
          {filteredRoster.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No players match these filters.</td></tr>}
          {filteredRoster.map((f) => {
            const online = isFriendOnline(f, Date.now());
            const live = online && f.current_game ? creditSeconds(f.game_started_at, f.last_seen, Date.now()) : 0;
            const play = { ...f.play_seconds };
            if (live && f.current_game) play[f.current_game] = (play[f.current_game] ?? 0) + live;
            const favorite = topGame(play);
            const state = online ? f.current_game ? "Playing" : "On hub" : "Offline";
            return <tr key={f.id} className="border-t border-border align-top hover:bg-muted/20"><td className="px-4 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initials(f.name)}</span><div><p className="font-semibold">{f.name || "(no name)"}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><span className={`h-2 w-2 rounded-full ${online ? "bg-success" : "bg-muted-foreground/50"}`}/>{state}</p></div></div></td>
              <td className="px-4 py-4">{f.current_game && online ? <><span className="rounded-full bg-chart-3/10 px-2.5 py-1 text-xs font-medium text-chart-3">{f.current_game}</span><p className="mt-2 text-xs text-muted-foreground">{formatDuration(live)} this session</p></> : <span className="text-muted-foreground">{online ? "Browsing hub" : "No active session"}</span>}<p className="mt-2 text-xs text-muted-foreground">Last seen {when(f.last_seen)}</p></td>
              <td className="px-4 py-4"><div className="flex max-w-[300px] flex-wrap gap-1.5">{f.cpu_cores ? <InfoChip>{f.cpu_cores} cores</InfoChip> : <InfoChip>CPU unavailable</InfoChip>}{f.memory_gb ? <InfoChip>{f.memory_gb} GB RAM</InfoChip> : <InfoChip>RAM unavailable</InfoChip>}{f.screen && <InfoChip>{f.screen}</InfoChip>}{f.browser_version && <InfoChip>{f.browser_version}</InfoChip>}</div><p className="mt-2 text-xs text-muted-foreground">{f.device || "Browser not recorded"}</p></td>
              <td className="px-4 py-4"><p className="font-semibold tabular-nums">{formatDuration((f.total_play_seconds ?? 0) + live)}</p>{favorite ? <p className="mt-1 text-xs text-muted-foreground">Favorite <span className="font-medium text-foreground">{favorite.game}</span> · {formatDuration(favorite.seconds)}</p> : <p className="mt-1 text-xs text-muted-foreground">No game history yet</p>}<div className="mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${favorite ? Math.min(100, Math.max(8, favorite.seconds / Math.max(1, f.total_play_seconds + live) * 100)) : 0}%` }} /></div></td>
              <td className="px-4 py-4">{f.device_id ? <div className="max-w-[240px]"><code className="block break-all rounded bg-muted px-2 py-1 font-mono text-xs">{f.device_id}</code><div className="mt-2 flex gap-1"><Button variant="outline" size="sm" className={btn} aria-label={`Copy browser ID for ${f.name}`} onClick={() => copyText(f.device_id ?? "", "Browser ID copied")}><Copy className="mr-1 h-3 w-3"/>Copy</Button><Button variant="outline" size="sm" className={btn} aria-label={`Ban ${f.name}'s browser`} onClick={() => banDevice(f.device_id ?? "", f.name)}><Ban className="mr-1 h-3 w-3"/>Ban</Button></div></div> : <span className="text-muted-foreground">Not recorded</span>}</td>
              <td className="max-w-[220px] px-4 py-4"><button type="button" className="block max-w-full truncate text-left text-sm text-muted-foreground hover:text-foreground" title={f.admin_note || "Add private note"} onClick={() => openEditor({ kind: "note", friend: f, value: f.admin_note ?? "" })}>{f.admin_note || "Add private note…"}</button></td>
            </tr>;
          })}
        </tbody></table></div>
      </section>}

      {tab === "friends" && <section><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-sm text-muted-foreground">Manage player accounts, active sessions, and access. Passwords are hidden until you reveal them.</p><Button onClick={() => openEditor({ kind: "add", name: "" })}><Users className="mr-2 h-4 w-4"/>Add friend</Button></div>
        {friends.length === 0 ? <EmptyState title="No friend accounts yet" detail="Create an account to invite a player."/> : <div className="grid gap-3 xl:grid-cols-2">{friends.map((f) => {
          const online = isFriendOnline(f, Date.now());
          const expired = !!f.expires_at && Date.parse(f.expires_at) <= Date.now();
          const daysUntil = f.expires_at ? Math.ceil((Date.parse(f.expires_at) - Date.now()) / 86_400_000) : null;
          const status = f.paused ? "Paused" : expired ? "Expired" : online ? "Online" : f.online ? "Session active / stale" : "Offline";
          const visible = visiblePasswords.includes(f.id);
          return <article key={f.id} className="rounded-xl border border-border p-4 transition-colors hover:bg-muted/20"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{initials(f.name)}</span><div className="min-w-0"><h3 className="truncate font-semibold">{f.name || "(no name)"}</h3><p className="mt-1 text-xs text-muted-foreground">Last seen {when(f.last_seen)}</p></div></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${online ? "bg-success/10 text-success" : f.paused || expired ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>{status}</span></div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Player password</p><code className="mt-1 block font-mono text-sm">{visible ? f.password : "••••••••••••"}</code></div><div className="flex gap-1"><Button variant="outline" size="sm" className={btn} onClick={() => setVisiblePasswords((current) => visible ? current.filter((id) => id !== f.id) : [...current, f.id])}>{visible ? "Hide" : "Reveal"}</Button><Button variant="outline" size="icon" className="h-8 w-8" aria-label={`Copy password for ${f.name}`} onClick={() => copyText(f.password, "Password copied")}><Copy className="h-3.5 w-3.5"/></Button></div></div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs"><InfoChip>{!f.expires_at ? "Permanent" : expired ? "Expired" : daysUntil === 0 ? "Expires today" : `Expires in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`}</InfoChip>{f.current_game && <InfoChip>Playing {f.current_game}</InfoChip>}{f.device && <InfoChip>{f.device}</InfoChip>}</div>
            <details className="group mt-4 border-t border-border pt-3"><summary className="w-fit cursor-pointer list-none rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-muted">Actions <span aria-hidden="true">⌄</span></summary><div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" size="sm" className={btn} onClick={() => openEditor({ kind: "rename", friend: f, value: f.name })}>Rename</Button><Button variant="outline" size="sm" className={btn} onClick={() => openEditor({ kind: "password", friend: f, value: "", random: false })}>Rotate password</Button><Button variant="outline" size="sm" className={btn} onClick={() => void perform(f.paused ? "Friend unpaused" : "Friend paused", () => editFriend({ data: { id: f.id, paused: !f.paused } }))}>{f.paused ? "Unpause" : "Pause"}</Button><Button variant="outline" size="sm" className={btn} onClick={() => openEditor({ kind: "expiry", friend: f, value: f.expires_at ? new Date(f.expires_at).toISOString().slice(0, 16) : "" })}>Set expiry</Button><Button variant="outline" size="sm" className={btn} onClick={() => openEditor({ kind: "message", friend: f, value: "" })}>Message</Button>{f.online && <Button variant="outline" size="sm" className={btn} onClick={() => ask(`Kick ${f.name}?`, "This ends the player's active session immediately.", "Kick player", async () => { await kick({ data: { id: f.id } }); toast.success("Player kicked"); await refresh(); })}>Kick</Button>}{f.device_id && <Button variant="outline" size="sm" className={`${btn} text-destructive`} onClick={() => banDevice(f.device_id ?? "", f.name)}>Ban device</Button>}<Button variant="outline" size="sm" className={`${btn} text-destructive`} onClick={() => ask(`Delete ${f.name}'s account?`, "This permanently removes the friend account and cannot be undone.", "Delete account", async () => { await removeFriend({ data: { id: f.id } }); toast.success("Friend account deleted"); await refresh(); })}>Delete</Button></div></details>
          </article>;
        })}</div>}
      </section>}

      {tab === "access" && <section><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="max-w-xl text-sm text-muted-foreground">One-time codes can only be used once. Generate several together for an event.</p></div><div className="flex items-end gap-2"><label className="text-xs text-muted-foreground">Batch size<select value={codeBatch} onChange={(event) => setCodeBatch(event.target.value)} className="mt-1 block h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"><option value="1">1 code</option><option value="3">3 codes</option><option value="5">5 codes</option></select></label><Button onClick={() => void generateCodes()}><KeyRound className="mr-2 h-4 w-4"/>Generate codes</Button></div></div>
        <label className="relative mt-5 block max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={codeSearch} onChange={(event) => setCodeSearch(event.target.value)} placeholder="Search unused codes" aria-label="Search access codes" className="pl-9"/></label>
        {filteredCodes.length === 0 ? <EmptyState title={codes.length ? "No matching codes" : "No unused codes"} detail={codes.length ? "Try a different search." : "Generate a code when you're ready to invite players."}/> : <ul className="mt-4 grid gap-2 md:grid-cols-2">{filteredCodes.map((code) => <li key={code} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3"><code className="font-mono text-sm tracking-wider">{code}</code><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => copyText(code, "Access code copied")}><Copy className="mr-1.5 h-3.5 w-3.5"/>Copy</Button><Button variant="ghost" size="icon" aria-label={`Delete code ${code}`} onClick={() => ask("Delete this access code?", "The code will no longer be redeemable.", "Delete code", async () => { await removeCode({ data: { code } }); toast.success("Access code deleted"); await refresh(); })}><X className="h-4 w-4"/></Button></div></li>)}</ul>}
      </section>}

      {tab === "security" && <section><div className="grid gap-3 lg:grid-cols-2"><div className={`rounded-xl border p-5 ${settings.lockdown ? "border-destructive/40 bg-destructive/5" : "border-border"}`}><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-muted"><LockKeyhole className="h-5 w-5"/></span><div><h3 className="font-semibold">Lockdown {settings.lockdown ? "active" : "disabled"}</h3><p className="text-sm text-muted-foreground">{settings.lockdown ? "Players cannot access the hub." : "The hub is open to signed-in players."}</p></div></div><Button className="mt-4" variant={settings.lockdown ? "outline" : "secondary"} onClick={() => settings.lockdown ? void perform("Lockdown disabled", () => save({ data: { lockdown: false } })) : ask("Enable lockdown?", "Players will lose access to the hub until you switch lockdown off.", "Enable lockdown", async () => { await save({ data: { lockdown: true } }); toast.success("Lockdown enabled"); await refresh(); })}>{settings.lockdown ? "Disable lockdown" : "Enable lockdown"}</Button></div>
          <div className="rounded-xl border border-border p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-destructive/10 text-destructive"><Shield className="h-5 w-5"/></span><div><h3 className="font-semibold">Global Panic</h3><p className="text-sm text-muted-foreground">Evict all active player sessions.</p></div></div><Button variant="destructive" className="mt-4" onClick={() => ask("Global Panic", "Every active player will be signed out and redirected to Geometry.", "Kick everyone", async () => { await panic(); toast.success("All player sessions evicted"); await refresh(); })}>Kick everyone</Button></div>
        </div>
        <div className="mt-8"><div><h3 className="text-lg font-semibold">Banned browser IDs</h3><p className="mt-1 text-sm text-muted-foreground">Browser IDs can be reset and are not hardware identifiers. Only valid version-4 UUIDs are accepted.</p></div><form className="mt-4 flex max-w-xl flex-wrap gap-2" onSubmit={async (event) => { event.preventDefault(); if (!DEVICE_ID_PATTERN.test(banId)) { toast.error("Enter a valid version-4 UUID."); return; } try { await ban({ data: { deviceId: banId, banned: true } }); toast.success("Browser ID banned"); setBanId(""); await refresh(); } catch { toast.error("Could not ban this browser ID."); } }}><Input value={banId} onChange={(event) => setBanId(event.target.value)} placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx" pattern={DEVICE_ID_PATTERN.source} aria-label="Browser ID to ban" required className="min-w-[260px] flex-1 font-mono"/><Button type="submit" variant="destructive"><Ban className="mr-2 h-4 w-4"/>Ban device</Button></form>
          {bans.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">No browser IDs are currently banned.</p> : <ul className="mt-4 divide-y divide-border rounded-xl border border-border">{bans.map((item) => <li key={item.device_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><code className="break-all font-mono text-xs">{item.device_id}</code><p className="mt-1 text-xs text-muted-foreground">{item.note || "No note"} · added {when(item.created_at)}</p></div><Button variant="outline" size="sm" onClick={() => void perform("Browser ID unbanned", () => ban({ data: { deviceId: item.device_id, banned: false } }))}>Unban</Button></li>)}</ul>}
        </div>
      </section>}

      {tab === "activity" && <section><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">Recent security and sign-in events. Attempted input is sensitive; only review it when needed.</p></div><Button variant="outline" size="sm" onClick={() => ask("Clear activity history?", "This removes all entries from the recent activity feed.", "Clear history", async () => { await clearLog(); toast.success("Activity history cleared"); await refresh(); })}>Clear history</Button></div>
        <div className="mt-4 flex flex-wrap gap-1.5">{(["all", "failed", "success", "admin"] as const).map((filter) => <FilterPill key={filter} active={activityFilter === filter} onClick={() => setActivityFilter(filter)}>{filter === "all" ? "All" : filter === "failed" ? `Failed / blocked (${failureCount})` : filter === "success" ? "Success" : "Admin logins"}</FilterPill>)}</div>
        {filteredLog.length === 0 ? <EmptyState title="No activity in this view" detail="New activity will appear here as it happens."/> : <ol className="mt-4 divide-y divide-border rounded-xl border border-border">{filteredLog.map((entry, index) => { const failed = ["wrong", "admin_wrong", "blocked", "tripwire"].includes(entry.kind); const success = ["code", "login", "admin_login"].includes(entry.kind); return <li key={`${entry.at}-${index}`} className="flex flex-wrap justify-between gap-4 px-4 py-4"><div className="min-w-0 flex-1 space-y-2"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${failed ? "bg-destructive/10 text-destructive" : success ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{failed ? <><span className="h-1.5 w-1.5 rounded-full bg-destructive"/>Failed / blocked</> : success ? <><Check className="h-3 w-3"/>Success</> : entry.kind}</span><p className="break-words text-sm">{entry.detail}</p>{entry.attempted_input !== null && <code className="block max-w-2xl break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">Entered: {entry.attempted_input || "(empty)"}</code>}{entry.device_id && <div className="flex flex-wrap items-center gap-2"><InfoChip>{entry.device_id}</InfoChip><Button variant="outline" size="sm" className={btn} onClick={() => copyText(entry.device_id ?? "", "Browser ID copied")}><Copy className="mr-1 h-3 w-3"/>Copy ID</Button><Button variant="outline" size="sm" className={btn} onClick={() => banDevice(entry.device_id ?? "", "Activity review")}>Ban device</Button></div>}</div><time className="whitespace-nowrap text-xs text-muted-foreground">{when(entry.at)}</time></li>; })}</ol>}
      </section>}
    </section>

    <Dialog open={!!editor} onOpenChange={(open) => { if (!open && !saving) setEditor(null); }}>
      <DialogContent><DialogHeader><DialogTitle>{editorTitle(editor)}</DialogTitle><DialogDescription>{editorDescription(editor)}</DialogDescription></DialogHeader>
        <form onSubmit={saveEditor} className="space-y-4">
          {editor?.kind === "add" && <label className="block text-sm font-medium">Friend name<Input autoFocus className="mt-1" maxLength={40} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="Name" required/></label>}
          {editor?.kind === "rename" && <label className="block text-sm font-medium">New name<Input autoFocus className="mt-1" maxLength={40} value={editor.value} onChange={(event) => setEditor({ ...editor, value: event.target.value })} required/></label>}
          {editor?.kind === "password" && <><label className="block text-sm font-medium">New password<Input autoFocus className="mt-1 font-mono" maxLength={40} value={editor.value} disabled={editor.random} onChange={(event) => setEditor({ ...editor, value: event.target.value })} placeholder="Enter a password (4+ characters)" required={!editor.random} minLength={4}/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!editor.random} onChange={(event) => setEditor({ ...editor, random: event.target.checked })}/>Generate a random password</label></>}
          {editor?.kind === "expiry" && <label className="block text-sm font-medium">Expiration date and time<input type="datetime-local" className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={editor.value} onChange={(event) => setEditor({ ...editor, value: event.target.value })}/><span className="mt-1 block text-xs font-normal text-muted-foreground">Leave empty to remove expiration.</span></label>}
          {editor?.kind === "message" && <label className="block text-sm font-medium">Message to {editor.friend.name}<Textarea autoFocus maxLength={300} className="mt-1" value={editor.value} onChange={(event) => setEditor({ ...editor, value: event.target.value })} placeholder="Write a message…" required/></label>}
          {editor?.kind === "note" && <label className="block text-sm font-medium">Private admin note for {editor.friend.name}<Textarea autoFocus maxLength={500} className="mt-1 min-h-28" value={editor.value} onChange={(event) => setEditor({ ...editor, value: event.target.value })} placeholder="Only visible to admins…"/></label>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setEditor(null)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : editor?.kind === "note" ? "Save note" : "Save changes"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle><AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(event) => { event.preventDefault(); const action = confirmAction?.run; setConfirmAction(null); if (action) void action().catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Action failed")); }}>{confirmAction?.label ?? "Continue"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}

function editorTitle(editor: Editor | null) {
  if (!editor) return "Edit account";
  return ({ add: "Add friend", rename: "Rename friend", password: "Rotate password", expiry: "Set account expiry", message: "Send a message", note: "Edit private note" } as const)[editor.kind];
}
function editorDescription(editor: Editor | null) {
  if (!editor) return "Update account details.";
  return editor.kind === "note" ? "This note is private to the admin team and is never shown to the player." : editor.kind === "message" ? "This message is delivered to the player inside the games hub." : "Changes are saved securely to the player account.";
}
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?"; }
function StatChip({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) { return <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-3"><span className="text-muted-foreground">{icon}</span><div><p className="text-lg font-bold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></div>; }
function StatCard({ label, value, detail, accent }: { label: string; value: number; detail: string; accent: string }) { return <article className="rounded-xl border border-border bg-background p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-2 text-3xl font-bold ${accent}`}>{value}</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Live</span></div><p className="mt-2 text-xs text-muted-foreground">{detail}</p></article>; }
function InfoChip({ children }: { children: React.ReactNode }) { return <span className="inline-flex max-w-full items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground">{children}</span>; }
function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-full border px-2.5 py-1.5 text-xs font-medium transition ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"}`}>{children}</button>; }
function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="mt-5 rounded-xl border border-dashed border-border px-5 py-10 text-center"><p className="font-semibold">{title}</p><p className="mt-2 text-sm text-muted-foreground">{detail}</p></div>; }

function AdminGate() {
  const router = useRouter();
  const login = useServerFn(adminLogin);
  const [open, setOpen] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  useEffect(() => { setDeviceId(getBrowserDeviceId()); }, []);
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password") as string;
    const { ok } = await login({ data: { password, deviceId } });
    if (ok) { sessionStorage.setItem("admin-tab", "1"); sessionStorage.setItem("gate-tab", "1"); await router.invalidate(); }
    else await router.navigate({ to: "/geometry" });
  }
  return <div className="min-h-screen bg-background p-8 font-serif text-foreground"><h1 className="text-center text-3xl font-bold">404 Not Found</h1><hr className="my-4 border-border"/><p className="mx-auto max-w-xl text-center text-muted-foreground">This page is protected. Sign in from a Chromebook device to access the admin workspace.</p><div className="mx-auto mt-8 max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm"><form onSubmit={onSubmit} className="space-y-4"><label className="block text-sm font-medium">Admin password<Input type="password" name="password" autoFocus className="mt-1" placeholder="Enter admin password" required/></label><Button type="submit" className="w-full">Open admin</Button></form></div></div>;
}
function DeviceControls({ id, onBan, onCopy }: { id: string; onBan: () => Promise<void>; onCopy?: () => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  return <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs"><code className="break-all">{id}</code><Button variant="ghost" size="icon" className="h-7 w-7" title={copied ? "Copied" : "Copy browser ID"} onClick={async () => { if (onCopy) { await onCopy(); setCopied(true); setTimeout(() => setCopied(false), 1200); } }}><Copy className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-7 w-7" title="Ban browser" onClick={() => void onBan()}><Ban className="h-3.5 w-3.5" /></Button></div>;
}
