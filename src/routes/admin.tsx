import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  adminLogin,
  getAdminSecurityOverview,
  revokeAdminSession,
  beginAdminTwoFactorSetup,
  confirmAdminTwoFactorSetup,
  verifyAdminTwoFactor,
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
  messageOnlineFriend,
  messageOnlineFriends,
  messageAllFriends,
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
  { id: "security", label: "Security Center", icon: Shield },
  { id: "activity", label: "Activity audit", icon: Activity },
] as const;
type AdminTab = typeof tabs[number]["id"];
type Friend = ReturnType<typeof Route.useLoaderData>["friends"][number];
type Editor =
  | { kind: "add"; name: string }
  | { kind: "rename" | "password" | "expiry" | "message" | "note" | "online-message"; friend: Friend; value: string; random?: boolean }
  | { kind: "broadcast-online" | "broadcast-all"; value: string };
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
  const onlineNote = useServerFn(messageOnlineFriend);
  const sendOnline = useServerFn(messageOnlineFriends);
  const sendAll = useServerFn(messageAllFriends);
  const addFriend = useServerFn(createFriend);
  const removeFriend = useServerFn(deleteFriend);
  const kick = useServerFn(kickFriend);
  const editFriend = useServerFn(updateFriend);
  const save = useServerFn(saveSettings);
  const clearLog = useServerFn(clearActivity);
  const make = useServerFn(createCode);
  const removeCode = useServerFn(deleteCode);
  const lock = useServerFn(lockAdmin);
  const loadAdminSecurity = useServerFn(getAdminSecurityOverview);
  const revokeSession = useServerFn(revokeAdminSession);
  const [adminSecurity, setAdminSecurity] = useState<Awaited<ReturnType<typeof getAdminSecurityOverview>> | null>(null);
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
  useEffect(() => {
    if (!admin || !tabOk) return;
    loadAdminSecurity({}).then(setAdminSecurity).catch(() => setAdminSecurity(null));
  }, [admin, tabOk, tab]);

  if (!accessOk || (admin && tabOk === null)) return null;
  if (!admin || !tabOk) return <AdminGate />;

  const refresh = () => router.invalidate();
  const onlineFriends = friends.filter((f) => isFriendOnline(f, Date.now()));
  const playingFriends = onlineFriends.filter((f) => f.current_game);
  const hubFriends = onlineFriends.filter((f) => !f.current_game);
  const failureCount = log.filter((entry) => ["wrong", "admin_wrong", "blocked", "tripwire"].includes(entry.kind)).length;
  const bannedIds = new Set(bans.map((item) => item.device_id));
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
  const failedSignIns = log.filter((entry) => ["wrong", "admin_wrong"].includes(entry.kind)).length;
  const blockedEvents = log.filter((entry) => ["blocked", "tripwire"].includes(entry.kind)).length;
  const tripwireEvents = log.filter((entry) => entry.kind === "tripwire").length;
  const adminSignIns = log.filter((entry) => entry.kind === "admin_login").length;
  const recentSecurityEvents = log.filter((entry) => ["wrong", "admin_wrong", "blocked", "tripwire", "ban", "admin_login", "admin_panic", "admin_lockdown"].includes(entry.kind)).slice(0, 8);
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
      } else if (editor.kind === "online-message") {
        const result = await onlineNote({ data: { id: editor.friend.id, message: editor.value } });
        if (!result.ok) throw new Error(result.error);
        toast.success(`Message sent to ${editor.friend.name}`);
      } else if (editor.kind === "broadcast-online") {
        const result = await sendOnline({ data: { message: editor.value } });
        if (!result.ok) throw new Error("Could not broadcast to online players");
        toast.success(`Message sent to ${result.sent} online player${result.sent === 1 ? "" : "s"}`);
      } else if (editor.kind === "broadcast-all") {
        const result = await sendAll({ data: { message: editor.value } });
        if (!result.ok) throw new Error("Could not broadcast to friend accounts");
        toast.success(`Broadcast sent to ${result.sent} account${result.sent === 1 ? "" : "s"}`);
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
  async function resetAllSessions() {
    if (!friends.length) { toast.error("No active sessions to clear."); return; }
    await Promise.all(friends.map((friend) => kick({ data: { id: friend.id } })));
    toast.success("All stored sessions have been cleared");
    await refresh();
  }

  const panelTitle = tabs.find((item) => item.id === tab)?.label ?? "Overview";
  return <main className="mx-auto min-h-screen max-w-[1500px] bg-background px-4 py-6 text-foreground sm:px-7 lg:px-10">
    <header className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
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
        <span className="ml-auto text-xs text-muted-foreground">Updated automatically every 5 seconds</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <StatChip label="Friends" value={friends.length} icon={<Users className="h-4 w-4" />} />
        <StatChip label="Playing" value={playingFriends.length} icon={<Gamepad2 className="h-4 w-4" />} />
        <StatChip label="On hub" value={hubFriends.length} icon={<LayoutDashboard className="h-4 w-4" />} />
        <StatChip label="Unused codes" value={codes.length} icon={<KeyRound className="h-4 w-4" />} />
        <StatChip label="Active bans" value={bans.length} icon={<Ban className="h-4 w-4" />} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-2">
          <span className="px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Online</span>
          <Button variant="outline" size="sm" disabled={onlineFriends.length === 0} onClick={() => openEditor({ kind: "broadcast-online", value: "" })}>Message online</Button>
          <Button variant="outline" size="sm" onClick={() => ask("Kick all online players?", `This ends every active session for ${onlineFriends.length} online player${onlineFriends.length === 1 ? "" : "s"}.`, "Kick online", async () => { await kickOnlineFriends(); })}>Kick online</Button>
          <Button variant="outline" size="sm" onClick={() => ask("Pause all online players?", "This freezes their access until you unpause them manually.", "Pause online", async () => { await pauseOnlineFriends(); })}>Pause online</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-2">
          <span className="px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">All</span>
          <Button variant="outline" size="sm" disabled={friends.length === 0} onClick={() => openEditor({ kind: "broadcast-all", value: "" })}>Message all</Button>
          <Button variant="outline" size="sm" onClick={() => ask("Clear every stored session?", "This signs out everyone and removes their active sessions from the roster.", "Clear all sessions", async () => { await resetAllSessions(); })}>Clear all sessions</Button>
        </div>
      </div>
    </header>

    <nav aria-label="Admin sections" role="tablist" className="sticky top-0 z-10 mt-5 flex gap-2 overflow-x-auto rounded-xl border border-border bg-background/95 p-2 backdrop-blur">
      {tabs.map(({ id, label, icon: Icon }) => {
        const count = id === "players" ? friends.length : id === "friends" ? onlineFriends.length : id === "access" ? codes.length : id === "security" ? bans.length : id === "activity" ? failureCount : null;
        return <button key={id} id={`admin-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls="admin-panel" onClick={() => setTab(id)} onKeyDown={(event) => {
          if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const current = tabs.findIndex((item) => item.id === id);
          const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
          setTab(tabs[next]!.id);
          document.getElementById(`admin-tab-${tabs[next]!.id}`)?.focus();
        }} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${tab === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}>
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
          {onlineFriends.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No friends checked in during the last two minutes.</p> : <ul className="mt-4 grid gap-3 lg:grid-cols-2">{onlineFriends.map((f) => <li key={f.id} className="rounded-xl border border-border p-4 transition-colors hover:bg-muted/20"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{f.name || "(no name)"}</p><p className="mt-1 text-sm">{f.current_game ? <>Playing <strong>{f.current_game}</strong></> : "Browsing the games hub"}</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" />Online</span></div><div className="mt-4 flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2 text-xs"><span className="text-muted-foreground">Last seen</span><span className="font-medium">{when(f.last_seen)}</span></div><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-border px-2 py-1">{f.device || "Unknown device"}</span>{f.device_id && <span className="rounded-full border border-border px-2 py-1 font-mono">{f.device_id}</span>}</div><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => openEditor({ kind: "online-message", friend: f, value: "" })}>Message</Button><Button variant="destructive" size="sm" onClick={() => ask("Kick player?", "This ends the player's current session.", "Kick player", async () => { await kick({ data: { id: f.id } }); toast.success("Player was kicked"); await refresh(); })}>Kick</Button></div></li>)}</ul>}
        </section>
      </>}

      {tab === "players" && <section><p className="mb-4 text-sm text-muted-foreground">Hardware values are browser-reported estimates; some browsers hide RAM or core counts. Admin notes are private.</p>
        <div className="mb-4 flex flex-wrap items-center gap-3"><label className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={rosterSearch} onChange={(event) => setRosterSearch(event.target.value)} placeholder="Search players, games, browser IDs" className="pl-9" /></label><select value={rosterFilter} onChange={(event) => setRosterFilter(event.target.value as RosterFilter)} className="h-10 rounded-md border border-border bg-background px-3 text-sm"><option value="all">All players</option><option value="playing">Playing</option><option value="hub">On hub</option><option value="offline">Offline</option><option value="banned">Banned</option></select></div>
        <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[1350px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>{["Player", "Active state", "Hardware footprint", "Playtime stats", "Browser ID", "Admin note", "Actions"].map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-4 py-3">{heading}</th>)}</tr></thead><tbody>
          {filteredRoster.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No players match these filters.</td></tr>}
          {filteredRoster.map((f) => {
            const online = isFriendOnline(f, Date.now());
            const live = online && f.current_game ? creditSeconds(f.game_started_at, f.last_seen, Date.now()) : 0;
            const play = { ...f.play_seconds };
            if (live && f.current_game) play[f.current_game] = (play[f.current_game] ?? 0) + live;
            const favorite = topGame(play);
            const state = online ? f.current_game ? "Playing" : "On hub" : "Offline";
            return <tr key={f.id} className="border-t border-border align-top hover:bg-muted/20"><td className="px-4 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{initials(f.name)}</span><div><p className="font-semibold">{f.name || "(no name)"}</p><p className="mt-1 text-xs text-muted-foreground">{f.password ? "Account active" : "Passwordless"}</p></div></div></td><td className="px-4 py-4">{f.current_game && online ? <><span className="rounded-full bg-chart-3/10 px-2.5 py-1 text-xs font-medium text-chart-3">{f.current_game}</span><p className="mt-2 text-xs text-muted-foreground">{formatDuration(live)} this session</p></> : <span className="text-muted-foreground">{online ? "Browsing hub" : "No active session"}</span>}<p className="mt-2 text-xs text-muted-foreground">Last seen {when(f.last_seen)}</p></td><td className="px-4 py-4"><div className="flex max-w-[300px] flex-wrap gap-1.5">{f.cpu_cores ? <InfoChip>{f.cpu_cores} cores</InfoChip> : <InfoChip>CPU unavailable</InfoChip>}{f.memory_gb ? <InfoChip>{f.memory_gb} GB RAM</InfoChip> : <InfoChip>RAM unavailable</InfoChip>}{f.screen ? <InfoChip>{f.screen}</InfoChip> : <InfoChip>Display hidden</InfoChip>}</div></td><td className="px-4 py-4"><p className="font-semibold tabular-nums">{formatDuration((f.total_play_seconds ?? 0) + live)}</p>{favorite ? <p className="mt-1 text-xs text-muted-foreground">Favorite: {favorite.game}</p> : <p className="mt-1 text-xs text-muted-foreground">No play stats yet</p>}</td><td className="px-4 py-4">{f.device_id ? <div className="max-w-[240px]"><code className="block break-all rounded bg-muted px-2 py-1 font-mono text-xs">{f.device_id}</code><div className="mt-2 flex gap-2"><Button variant="ghost" size="sm" onClick={() => void copyText(f.device_id ?? "", "Browser ID copied")}>Copy</Button><Button variant="outline" size="sm" onClick={() => void banDevice(f.device_id ?? "")}>Ban</Button></div></div> : <span className="text-muted-foreground">No browser ID</span>}</td><td className="max-w-[220px] px-4 py-4"><button type="button" className="block max-w-full truncate text-left text-sm text-muted-foreground hover:text-foreground" title={f.admin_note || "No private note"}>{f.admin_note || "No private note"}</button></td><td className="px-4 py-4"><div className="flex flex-wrap gap-2">{online ? <><Button variant="outline" size="sm" onClick={() => openEditor({ kind: "online-message", friend: f, value: "" })}>Message</Button><Button variant="destructive" size="sm" onClick={() => ask("Kick player?", "This ends the player's current session.", "Kick player", async () => { await kick({ data: { id: f.id } }); toast.success("Player was kicked"); await refresh(); })}>Kick</Button></> : <span className="text-xs text-muted-foreground">Offline</span>}</div></td></tr>;
          })}
        </tbody></table></div>
      </section>}

      {tab === "friends" && <section><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-sm text-muted-foreground">Manage player accounts, active check-ins, and account expiry.</p><Button variant="secondary" onClick={() => openEditor({ kind: "add", name: "" })}>Add account</Button></div>
        {friends.length === 0 ? <EmptyState title="No friend accounts yet" detail="Create an account to invite a player."/> : <div className="grid gap-3 xl:grid-cols-2">{friends.map((f) => {
          const online = isFriendOnline(f, Date.now());
          const expired = !!f.expires_at && Date.parse(f.expires_at) <= Date.now();
          const daysUntil = f.expires_at ? Math.ceil((Date.parse(f.expires_at) - Date.now()) / 86_400_000) : null;
          const status = f.paused ? "Paused" : expired ? "Expired" : online ? "Online" : f.online ? "Session active / stale" : "Offline";
          const visible = visiblePasswords.includes(f.id);
          return <article key={f.id} className="rounded-xl border border-border p-4 transition-colors hover:bg-muted/20"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{initials(f.name)}</span><div className="min-w-0"><h3 className="truncate font-semibold">{f.name || "(no name)"}</h3><p className="mt-1 text-xs text-muted-foreground">Last seen {when(f.last_seen)}</p></div></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${online ? "bg-success/10 text-success" : f.paused || expired ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>{status}</span></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="rounded-lg bg-muted/30 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Login</p><p className="mt-1 truncate font-mono text-sm">{f.password}</p></div><div className="rounded-lg bg-muted/30 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Expires</p><p className="mt-1 text-sm">{f.expires_at ? when(f.expires_at) : "Never"}</p></div></div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs"><InfoChip>{!f.expires_at ? "Permanent" : expired ? "Expired" : daysUntil === 0 ? "Expires today" : `Expires in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`}</InfoChip>{f.online ? <InfoChip>Session active</InfoChip> : <InfoChip>Offline</InfoChip>}</div>
            <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => openEditor({ kind: "rename", friend: f, value: f.name })}>Rename</Button><Button variant="outline" size="sm" onClick={() => openEditor({ kind: "password", friend: f, value: f.password })}>Rotate password</Button><Button variant="outline" size="sm" onClick={() => openEditor({ kind: "expiry", friend: f, value: f.expires_at ?? "" })}>Set expiry</Button><Button variant="outline" size="sm" onClick={() => openEditor({ kind: "message", friend: f, value: "" })}>Send message</Button><Button variant="outline" size="sm" onClick={() => openEditor({ kind: "note", friend: f, value: f.admin_note ?? "" })}>Note</Button><Button variant="destructive" size="sm" onClick={() => ask("Delete this friend account?", "This permanently removes the record and its saved password.", "Delete account", async () => { await removeFriend({ data: { id: f.id } }); toast.success("Friend removed"); await refresh(); })}>Delete</Button></div>
          </article>;
        })}</div>}
      </section>}

      {tab === "access" && <section><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="max-w-xl text-sm text-muted-foreground">One-time codes can only be used once and are refreshed after each redemption.</p></div><div className="flex items-center gap-2"><Input value={codeBatch} onChange={(event) => setCodeBatch(event.target.value)} className="w-20" type="number" min={1} max={25} /><Button onClick={() => void generateCodes()}>Generate codes</Button></div></div>
        <label className="relative mt-5 block max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={codeSearch} onChange={(event) => setCodeSearch(event.target.value)} placeholder="Search access codes" className="pl-9" /></label>
        {filteredCodes.length === 0 ? <EmptyState title={codes.length ? "No matching codes" : "No unused codes"} detail={codes.length ? "Try a different search." : "Generate a code when you're ready to invite players."}/> : <ul className="mt-4 grid gap-2 md:grid-cols-2">{filteredCodes.map((code) => <li key={code} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3"><code className="font-mono text-sm tracking-wider">{code}</code><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => copyText(code, "Access code copied")}>Copy</Button><Button variant="ghost" size="icon" aria-label={`Delete code ${code}`} onClick={() => ask("Delete this access code?", "The code will no longer be redeemable.", "Delete code", async () => { await removeCode({ data: { code } }); toast.success("Access code deleted"); await refresh(); })}><X className="h-4 w-4" /></Button></div></li>)}</ul>}
      </section>}

      {tab === "security" && <section>
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Failed sign-ins" value={failedSignIns} detail="Wrong passwords or access codes in the retained audit window" accent="text-destructive" />
          <StatCard label="Blocked events" value={blockedEvents} detail="Rejected access and security blocks" accent="text-chart-3" />
          <StatCard label="Tripwire activations" value={tripwireEvents} detail="Non-Chromebook security events" accent="text-destructive" />
          <StatCard label="Admin sign-ins" value={adminSignIns} detail="Successful admin authentication events" accent="text-success" />
        </div>
        <div className="mb-6 rounded-xl border border-border bg-background p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-semibold">Security posture</h3><p className="mt-1 text-sm text-muted-foreground">Live status based on the controls and audit events currently available to this dashboard.</p></div>
            <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${settings.lockdown ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-success/30 bg-success/10 text-success"}`}>{settings.lockdown ? "Lockdown active" : "Access controls active"}</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <InfoChip>Chromebook tripwire enabled</InfoChip>
            <InfoChip>Failed-attempt auto-ban enabled</InfoChip>
            <InfoChip>{bans.length} banned browser IDs</InfoChip>
          </div>
        </div>
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Recent security events</h3><p className="mt-1 text-sm text-muted-foreground">Latest authentication, blocking, tripwire, and admin events.</p></div><Button variant="outline" size="sm" onClick={() => setTab("activity")}>Open full audit</Button></div>
          {recentSecurityEvents.length === 0 ? <EmptyState title="No recent security events" detail="New security events will appear here as they happen." /> : <ol className="mt-3 divide-y divide-border rounded-xl border border-border bg-background">{recentSecurityEvents.map((entry) => <li key={`${entry.id}-security`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="font-medium">{entry.detail}</p><p className="mt-1 text-xs text-muted-foreground">{entry.kind} · {when(entry.created_at)}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${["wrong", "admin_wrong", "blocked", "tripwire"].includes(entry.kind) ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>{entry.kind}</span></li>)}</ol>}
        </div>
        <div className="grid gap-3 lg:grid-cols-2"><div className={`rounded-xl border p-5 ${settings.lockdown ? "border-destructive/40 bg-destructive/5" : "border-border bg-background"}`}><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-destructive/10 text-destructive"><LockKeyhole className="h-5 w-5" /></span><div><h3 className="font-semibold">Lockdown</h3><p className="text-sm text-muted-foreground">Block access to the games hub and redirect players back to Geometry.</p></div></div><Button variant={settings.lockdown ? "outline" : "secondary"} className="mt-4" onClick={() => settings.lockdown
          ? void perform("Lockdown disabled", () => save({ data: { lockdown: false } }))
          : ask("Enable lockdown?", "Players will lose access to the games hub until lockdown is disabled.", "Enable lockdown", async () => { await save({ data: { lockdown: true } }); toast.success("Lockdown enabled"); await refresh(); })}>{settings.lockdown ? "Disable lockdown" : "Enable lockdown"}</Button></div><div className="rounded-xl border border-border p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-destructive/10 text-destructive"><Shield className="h-5 w-5" /></span><div><h3 className="font-semibold">Global Panic</h3><p className="text-sm text-muted-foreground">Evict all active player sessions.</p></div></div><Button variant="destructive" className="mt-4" onClick={() => ask("Global Panic", "Every active player will be signed out and redirected to Geometry.", "Kick everyone", async () => { await panic(); toast.success("All player sessions evicted"); await refresh(); })}>Kick everyone</Button></div></div>
        <div className="mt-8"><div><h3 className="text-lg font-semibold">Banned browser IDs</h3><p className="mt-1 text-sm text-muted-foreground">Browser IDs can be reset and are not hardware identity.</p></div>
          {bans.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">No browser IDs are currently banned.</p> : <ul className="mt-4 divide-y divide-border rounded-xl border border-border">{bans.map((item) => <li key={item.device_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><code className="break-all font-mono text-xs">{item.device_id}</code><p className="mt-1 text-xs text-muted-foreground">{item.note || "No note"} · added {when(item.created_at)}</p></div><Button variant="outline" size="sm" onClick={() => void perform("Browser ID unbanned", () => ban({ data: { deviceId: item.device_id, banned: false } }))}>Unban</Button></li>)}</ul>}
        </div>
        <div className="mt-8 space-y-4">
          <div><h3 className="text-lg font-semibold">Administrator security</h3><p className="mt-1 text-sm text-muted-foreground">Two-factor authentication, active admin sessions, and a protected audit trail.</p></div>
          {!adminSecurity ? <p className="text-sm text-muted-foreground">Loading administrator security…</p> : <>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background p-4">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${adminSecurity.twoFactorEnabled ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>{adminSecurity.twoFactorEnabled ? "Two-factor enabled" : "Two-factor not enabled"}</span>
              <span className="text-sm text-muted-foreground">{adminSecurity.remainingRecoveryCodes} recovery codes remaining</span>
            </div>
            <div><h4 className="font-semibold">Active administrator sessions</h4>
              {adminSecurity.sessions.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No active sessions.</p> : <ul className="mt-2 divide-y divide-border rounded-xl border border-border">{adminSecurity.sessions.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="font-medium">{item.device || "Unknown device"} {item.current && <span className="ml-2 text-xs text-success">Current session</span>}</p><p className="mt-1 text-xs text-muted-foreground">{item.role} · Last active {when(item.last_seen_at)} · Expires {when(item.expires_at)}</p></div><Button size="sm" variant="outline" disabled={item.current} onClick={() => void perform("Admin session revoked", async () => { await revokeSession({ data: { id: item.id } }); setAdminSecurity(await loadAdminSecurity({})); })}>Revoke</Button></li>)}</ul>}
            </div>
            <div><h4 className="font-semibold">Protected admin audit log</h4><p className="mt-1 text-xs text-muted-foreground">Append-only records of authenticator and session security events.</p>
              {adminSecurity.audit.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No admin security events recorded yet.</p> : <ol className="mt-2 divide-y divide-border rounded-xl border border-border">{adminSecurity.audit.map((entry) => <li key={entry.id} className="px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{entry.action.replace(/_/g, " ")}</span><span className="text-xs text-muted-foreground">{when(entry.created_at)}</span></div><p className="mt-1 text-sm text-muted-foreground">{entry.detail}</p></li>)}</ol>}
            </div>
          </>}
        </div>
      </section>}

      {tab === "activity" && <section><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">Recent security and sign-in events. Attempted inputs are kept for audit only.</p></div><Button variant="outline" size="sm" onClick={() => void perform("Activity log cleared", () => clearLog({}))}>Clear log</Button></div>
        <div className="mt-4 flex flex-wrap gap-1.5">{(["all", "failed", "success", "admin"] as const).map((filter) => <FilterPill key={filter} active={activityFilter === filter} onClick={() => setActivityFilter(filter)}>{filter === "all" ? "All" : filter === "failed" ? "Failed" : filter === "success" ? "Success" : "Admin"}</FilterPill>)}</div>
        {filteredLog.length === 0 ? <EmptyState title="No activity in this view" detail="New activity will appear here as it happens."/> : <ol className="mt-4 divide-y divide-border rounded-xl border border-border bg-background">{filteredLog.map((entry) => <li key={`${entry.id}-${entry.created_at}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="font-medium">{entry.detail}</p><p className="mt-1 text-xs text-muted-foreground">{entry.kind} · {when(entry.created_at)}</p>{entry.attempted_input && <p className="mt-2 text-xs text-muted-foreground">Submitted input redacted for security.</p>}</div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${entry.kind.includes("wrong") || entry.kind === "blocked" || entry.kind === "tripwire" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>{entry.kind}</span></li>)}</ol>}
      </section>}
    </section>

    <Dialog open={!!editor} onOpenChange={(open) => { if (!open && !saving) setEditor(null); }}>
      <DialogContent><DialogHeader><DialogTitle>{editorTitle(editor)}</DialogTitle><DialogDescription>{editorDescription(editor)}</DialogDescription></DialogHeader>
        <form onSubmit={saveEditor} className="space-y-4">
          {editor?.kind === "add" && <label className="block text-sm font-medium">Friend name<Input autoFocus className="mt-1" maxLength={40} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>}
          {editor?.kind === "rename" && <label className="block text-sm font-medium">New name<Input autoFocus className="mt-1" maxLength={40} value={editor.value} onChange={(event) => setEditor({ ...editor, value: event.target.value })} /></label>}
          {editor?.kind === "password" && <><label className="block text-sm font-medium">New password<Input autoFocus className="mt-1 font-mono" maxLength={40} value={editor.value} disabled={editor.random} onChange={(event) => setEditor({ ...editor, value: event.target.value })} />{!editor.random && <p className="mt-2 text-xs text-muted-foreground">Leave blank to auto-generate a fresh password.</p>}</label></>}
          {editor?.kind === "expiry" && <label className="block text-sm font-medium">Expiration date and time<input type="datetime-local" className="mt-1 block h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={editor.value ? new Date(editor.value).toISOString().slice(0, 16) : ""} onChange={(event) => setEditor({ ...editor, value: event.target.value })} /></label>}
          {editor?.kind === "message" && <label className="block text-sm font-medium">Message to {editor.friend.name}<Textarea autoFocus maxLength={300} className="mt-1" value={editor.value} onChange={(event) => setEditor({ ...editor, value: event.target.value })} /></label>}
          {editor?.kind === "online-message" && <label className="block text-sm font-medium">Message to {editor.friend.name}<Textarea autoFocus maxLength={300} className="mt-1" value={editor.value} onChange={(event) => setEditor({ ...editor, value: event.target.value })} /></label>}
          {(editor?.kind === "broadcast-online" || editor?.kind === "broadcast-all") && <label className="block text-sm font-medium">{editor.kind === "broadcast-online" ? "Message to online players" : "Message to all friend accounts"}<Textarea autoFocus maxLength={300} className="mt-1 min-h-28" value={editor.value} onChange={(event) => setEditor({ ...editor, value: event.target.value })} /></label>}
          {editor?.kind === "note" && <label className="block text-sm font-medium">Private admin note for {editor.friend.name}<Textarea autoFocus maxLength={500} className="mt-1 min-h-28" value={editor.value} onChange={(event) => setEditor({ ...editor, value: event.target.value })} /></label>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setEditor(null)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle><AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={async () => { if (!confirmAction) return; setConfirmAction(null); await confirmAction.run(); }}>{confirmAction?.label}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}

function editorTitle(editor: Editor | null) {
  if (!editor) return "Edit account";
  return ({ add: "Add friend", rename: "Rename friend", password: "Rotate password", expiry: "Set account expiry", message: "Send a message", "online-message": "Message online player", "broadcast-online": "Message online players", "broadcast-all": "Message all accounts", note: "Edit private note" } as const)[editor.kind];
}
function editorDescription(editor: Editor | null) {
  if (!editor) return "Update account details.";
  if (editor.kind === "note") return "This note is private to the admin team and is never shown to the player.";
  if (editor.kind === "message") return "This message is queued for the selected account and delivered when they check in.";
  if (editor.kind === "online-message") return "This message is sent only if the player is still active right now.";
  if (editor.kind === "broadcast-online") return "Only active, unpaused accounts checked in within the last two minutes receive this message.";
  if (editor.kind === "broadcast-all") return "This queues the same message for every friend account, including players who are currently offline.";
  return "Update the selected account detail.";
}
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?"; }
function StatChip({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) { return <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</span><div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div></div>; }
function StatCard({ label, value, detail, accent }: { label: string; value: number; detail: string; accent: string }) { return <article className="rounded-xl border border-border bg-background p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className={`mt-2 text-3xl font-bold ${accent}`}>{value}</p><p className="mt-2 text-xs text-muted-foreground">{detail}</p></article>; }
function InfoChip({ children }: { children: React.ReactNode }) { return <span className="inline-flex max-w-full items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">{children}</span>; }
function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}>{children}</button>; }
function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="mt-5 rounded-xl border border-dashed border-border px-5 py-10 text-center"><p className="font-semibold">{title}</p><p className="mt-2 text-sm text-muted-foreground">{detail}</p></div>; }

function AdminGate() {
  const router = useRouter();
  const login = useServerFn(adminLogin);
  const beginSetup = useServerFn(beginAdminTwoFactorSetup);
  const confirmSetup = useServerFn(confirmAdminTwoFactorSetup);
  const verifySecondFactor = useServerFn(verifyAdminTwoFactor);
  const [deviceId, setDeviceId] = useState("");
  const [stage, setStage] = useState<"password" | "setup" | "verify" | "recovery">("password");
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDeviceId(getBrowserDeviceId()); }, []);

  async function onPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const password = new FormData(event.currentTarget).get("password") as string;
      const result = await login({ data: { password, deviceId } });
      if ("requiresSetup" in result && result.requiresSetup) {
        const setup = await beginSetup({});
        setSecret(setup.secret);
        setUri(setup.uri);
        setStage("setup");
      } else if ("requiresTwoFactor" in result && result.requiresTwoFactor) setStage("verify");
      else toast.error("Admin sign-in failed.");
    } catch { toast.error("Admin sign-in failed."); }
    finally { setBusy(false); }
  }

  async function onCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const code = new FormData(event.currentTarget).get("code") as string;
      if (stage === "setup") {
        const result = await confirmSetup({ data: { code } });
        if (!result.ok) { toast.error(result.error); return; }
        setRecoveryCodes(result.recoveryCodes);
        setStage("recovery");
      } else {
        const result = await verifySecondFactor({ data: { code } });
        if (!result.ok) { toast.error("That code was not accepted."); return; }
        finishLogin();
      }
    } catch { toast.error("Two-factor verification failed."); }
    finally { setBusy(false); }
  }

  function finishLogin() {
    sessionStorage.setItem("admin-tab", "1");
    sessionStorage.setItem("gate-tab", "1");
    void router.invalidate();
  }

  return <div className="min-h-screen bg-background p-8 font-serif text-foreground">
    <h1 className="text-center text-3xl font-bold">404 Not Found</h1>
    <hr className="my-4 border-border" />
    <p className="text-center text-muted-foreground">This page is reserved for the site owner.</p>
    {stage === "password" && <form onSubmit={onPassword} className="mx-auto mt-6 max-w-sm space-y-3">
      <Input name="password" type="password" placeholder="Admin password" autoComplete="off" required />
      <Button type="submit" className="w-full" disabled={!deviceId || busy}>{busy ? "Checking…" : "Continue"}</Button>
    </form>}
    {stage === "setup" && <div className="mx-auto mt-6 max-w-md space-y-4">
      <h2 className="text-center text-xl font-semibold">Set up two-factor authentication</h2>
      <p className="text-sm text-muted-foreground">Add this account to an authenticator app, then enter the six-digit code it generates.</p>
      <div className="rounded-lg border border-border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">Manual setup key</p><code className="mt-2 block break-all text-sm">{secret}</code></div>
      <a className="block break-all text-xs text-primary underline" href={uri}>{uri}</a>
      <form onSubmit={onCode} className="space-y-3"><Input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="6-digit authenticator code" required /><Button className="w-full" type="submit" disabled={busy}>{busy ? "Verifying…" : "Enable two-factor authentication"}</Button></form>
    </div>}
    {stage === "verify" && <form onSubmit={onCode} className="mx-auto mt-6 max-w-sm space-y-3">
      <p className="text-center text-sm text-muted-foreground">Enter your authenticator code or a one-time recovery code.</p>
      <Input name="code" autoComplete="one-time-code" placeholder="Authenticator or recovery code" required />
      <Button className="w-full" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify and unlock"}</Button>
    </form>}
    {stage === "recovery" && <div className="mx-auto mt-6 max-w-md space-y-4">
      <h2 className="text-center text-xl font-semibold">Save your recovery codes</h2>
      <p className="text-sm text-muted-foreground">Each code works once. Save these somewhere secure now; they will not be shown again.</p>
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-4">{recoveryCodes.map((code) => <code key={code} className="text-center text-sm">{code}</code>)}</div>
      <Button className="w-full" onClick={finishLogin}>I saved my recovery codes — continue</Button>
    </div>}
  </div>;
}
