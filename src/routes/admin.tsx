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
import { Copy, Ban } from "lucide-react";
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

const when = (t: string | null) => t ? new Date(t).toLocaleString() : "never";
const mins = (t: string) => {
  const m = Math.floor((Date.now() - new Date(t).getTime()) / 60_000);
  return m < 1 ? "under a minute" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const btn = "rounded border border-border px-2 py-1 text-xs hover:bg-accent";
const tabs = [
  ["dashboard", "Dashboard"], ["players", "Player roster"], ["friends", "Friends"],
  ["access", "Access codes"], ["security", "Security"], ["activity", "Activity"],
] as const;
type AdminTab = typeof tabs[number][0];

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
  const [friendName, setFriendName] = useState("");
  const [banId, setBanId] = useState("");

  useEffect(() => {
    access({ data: { deviceId: getBrowserDeviceId() } }).then((result) => {
      if (!result.allowed) void router.navigate({ to: "/geometry" });
      else setAccessOk(true);
    });
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
  async function edit(id: string, patch: Omit<Parameters<typeof editFriend>[0]["data"], "id">) {
    const result = await editFriend({ data: { id, ...patch } });
    if (!result.ok) alert(result.error);
    await refresh();
  }
  async function banDevice(deviceId: string, noteText = "") {
    await ban({ data: { deviceId, note: noteText, banned: true } });
    await refresh();
  }

  return <main className="mx-auto min-h-screen max-w-7xl bg-background p-5 text-foreground sm:p-8">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Administration</p><h1 className="mt-1 text-3xl font-bold">Site controls</h1><p className="mt-1 text-sm text-muted-foreground">Dashboard refreshes every 5 seconds.</p></div>
      <span className={`rounded-full px-3 py-1 text-xs font-medium ${settings.lockdown ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>{settings.lockdown ? "Lockdown on" : "Site open"}</span>
    </header>

    <nav aria-label="Admin sections" role="tablist" className="sticky top-0 z-10 mt-6 flex gap-2 overflow-x-auto border-b border-border bg-background py-2">
      {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} aria-controls={`admin-panel-${id}`} onClick={() => setTab(id)} className={`shrink-0 rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>{label}</button>)}
    </nav>

    <div id={`admin-panel-${tab}`} role="tabpanel" className="pt-5">
      {tab === "dashboard" && <>
        <section aria-label="Live site statistics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Friends online" value={onlineFriends.length} detail="Active in the last 2 minutes" accent="text-success" />
          <StatCard label="Playing now" value={playingFriends.length} detail="Friends currently in a game" accent="text-chart-3" />
          <StatCard label="On the hub" value={onlineFriends.length - playingFriends.length} detail="Online, not in a game" accent="text-chart-2" />
          <StatCard label="Unused codes" value={codes.length} detail="One-time codes ready to use" accent="text-chart-1" />
        </section>
        <section className="mt-6 border-t border-border py-5">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-semibold">Friends online now</h2><p className="mt-1 text-sm text-muted-foreground">Current game and last-reported device. Browser IDs and hardware hints are not reliable hardware identity.</p></div><span className="text-xs text-muted-foreground">{onlineFriends.length} active</span></div>
          {onlineFriends.length === 0 ? <p className="mt-4 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">No friends have checked in during the last two minutes.</p> : <ul className="mt-4 grid gap-3 md:grid-cols-2">{onlineFriends.map((f) => <li key={f.id} className="rounded-lg border border-border bg-card p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{f.name || "(no name)"}</p><p className="mt-1 text-sm">{f.current_game ? <>Playing <strong>{f.current_game}</strong>{f.game_started_at && <span className="text-muted-foreground"> · {mins(f.game_started_at)}</span>}</> : "Browsing the games hub"}</p></div><span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700">Online</span></div><div className="mt-3 space-y-1 text-xs text-muted-foreground"><p><b className="text-foreground">Device:</b> {f.device || "Not reported"}</p>{f.device_id && <DeviceControls id={f.device_id} onBan={() => banDevice(f.device_id ?? "", f.name)} />}<p><b className="text-foreground">Last seen:</b> {when(f.last_seen)}</p></div></li>)}</ul>}
        </section>
        <Button variant="destructive" className="mt-3 h-auto whitespace-normal py-3" onClick={async () => { if (confirm("Kick everyone out?")) { await panic(); await refresh(); } }}>Global Panic (Kick All to Geometry)</Button>
      </>}

      {tab === "players" && <section><h2 className="text-2xl font-bold">Player Roster</h2><p className="mt-1 text-sm text-muted-foreground">Hardware values are browser-reported estimates and may be unavailable. Admin notes are private.</p>
        <div className="mt-4 overflow-x-auto rounded-lg border border-border"><table className="w-full min-w-[1200px] text-left text-sm"><thead className="bg-muted/40 text-xs uppercase text-muted-foreground"><tr>{["Name", "Browser ID", "Browser / ChromeOS", "Screen size", "CPU cores", "Memory", "Total playtime", "Most-played game", "Last seen", "Private admin note"].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-3 py-3">{h}</th>)}</tr></thead><tbody>
          {friends.length === 0 && <tr><td colSpan={10} className="p-5 text-muted-foreground">No friends yet.</td></tr>}
          {friends.map((f) => { const live = isFriendOnline(f, Date.now()) && f.current_game ? creditSeconds(f.game_started_at, f.last_seen, Date.now()) : 0; const play = { ...f.play_seconds }; if (live && f.current_game) play[f.current_game] = (play[f.current_game] ?? 0) + live; const top = topGame(play); return <tr key={f.id} className="border-t border-border align-top"><td className="px-3 py-3 font-medium">{f.name || "(no name)"}</td><td className="max-w-[180px] break-all px-3 py-3 font-mono text-xs">{f.device_id || "Not recorded"}</td><td className="px-3 py-3">{f.device || "Not reported"}<div className="text-xs text-muted-foreground">{f.browser_version || "Version unavailable"}</div></td><td className="px-3 py-3">{f.screen || "Unavailable"}</td><td className="px-3 py-3">{f.cpu_cores ?? "Unavailable"}</td><td className="px-3 py-3">{f.memory_gb ? `${f.memory_gb} GB` : "Unavailable"}</td><td className="whitespace-nowrap px-3 py-3">{formatDuration(f.total_play_seconds + live)}</td><td className="px-3 py-3">{top ? <>{top.game}<div className="text-xs text-muted-foreground">{formatDuration(top.seconds)}</div></> : "No game data yet"}</td><td className="whitespace-nowrap px-3 py-3">{when(f.last_seen)}</td><td className="max-w-[220px] px-3 py-3"><p className="mb-1 break-words">{f.admin_note || "—"}</p><Button variant="outline" size="sm" className={btn} onClick={() => { const value = prompt(`Private note for ${f.name}`, f.admin_note); if (value !== null) void edit(f.id, { admin_note: value }); }}>Edit note</Button></td></tr>; })}
        </tbody></table></div>
      </section>}

      {tab === "friends" && <section><h2 className="text-2xl font-bold">Friend accounts</h2><p className="mt-1 text-sm text-muted-foreground">Reusable passwords allow one active device at a time; signing in somewhere new replaces the previous session.</p>
        <form className="mt-4 flex max-w-lg gap-2" onSubmit={async (event) => { event.preventDefault(); await addFriend({ data: { name: friendName } }); setFriendName(""); await refresh(); }}><input value={friendName} onChange={(event) => setFriendName(event.target.value)} placeholder="Friend's name" className="min-w-0 flex-1 rounded border border-border bg-background px-3 py-2 text-sm"/><Button type="submit">Add friend</Button></form>
        <ul className="mt-4 space-y-3">{friends.length === 0 && <li className="text-sm text-muted-foreground">No friend passwords yet.</li>}{friends.map((f) => { const expired = !!f.expires_at && new Date(f.expires_at) < new Date(); const active = onlineFriends.some((o) => o.id === f.id); return <li key={f.id} className="rounded-lg border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><b>{f.name || "(no name)"}</b><span className="text-xs text-muted-foreground">{f.paused ? "paused" : expired ? "expired" : active ? "online" : f.online ? "session active / stale" : "offline"}</span></div><div className="mt-1 font-mono text-sm">{f.password}</div><p className="mt-1 text-xs text-muted-foreground">Last sign-in: {when(f.last_login)} · Last seen: {when(f.last_seen)}{f.expires_at && <> · Expires: {when(f.expires_at)}</>}</p>{f.current_game && <p className="mt-2 text-sm">Playing <b>{f.current_game}</b>{f.game_started_at && <span className="text-muted-foreground"> · {mins(f.game_started_at)}</span>}</p>}<div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" className={btn} onClick={() => { const name = prompt("New name", f.name); if (name !== null) void edit(f.id, { name }); }}>Rename</Button><Button variant="outline" size="sm" className={btn} onClick={() => { const password = prompt("New password (leave empty for a random one)"); if (password !== null) void edit(f.id, password.trim() ? { password } : { newRandom: true }); }}>Change password</Button><Button variant="outline" size="sm" className={btn} onClick={() => void edit(f.id, { paused: !f.paused })}>{f.paused ? "Unpause" : "Pause"}</Button><Button variant="outline" size="sm" className={btn} onClick={() => { const value = prompt("Expire after how many days? (empty = never)", ""); if (value === null) return; const days = Number(value); void edit(f.id, { expires_at: value.trim() && days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null }); }}>Expiry</Button><Button variant="outline" size="sm" className={btn} onClick={async () => { const message = prompt(`Message to ${f.name}`); if (message?.trim()) { await note({ data: { id: f.id, message } }); await refresh(); } }}>Message</Button>{f.device_id && <DeviceControls id={f.device_id} onBan={() => banDevice(f.device_id ?? "", f.name)} />}{f.online && <Button variant="outline" size="sm" className={btn} onClick={async () => { try { await kick({ data: { id: f.id } }); } catch (error) { alert((error as Error).message); } await refresh(); }}>Kick out</Button>}<Button variant="outline" size="sm" className={btn} onClick={async () => { if (confirm("Delete this password?")) { await removeFriend({ data: { id: f.id } }); await refresh(); } }}>Delete</Button></div></li>; })}</ul>
      </section>}

      {tab === "access" && <section><h2 className="text-2xl font-bold">One-time access codes</h2><p className="mt-1 text-sm text-muted-foreground">Each code works once, then disappears.</p><Button className="mt-4" onClick={async () => { await make(); await refresh(); }}>Make a new code</Button><ul className="mt-4 space-y-2">{codes.length === 0 && <li className="text-sm text-muted-foreground">No unused codes.</li>}{codes.map((code) => <li key={code} className="flex max-w-lg items-center justify-between rounded border border-border px-3 py-2 font-mono">{code}<Button variant="outline" size="sm" className={btn} onClick={async () => { await removeCode({ data: { code } }); await refresh(); }}>Delete</Button></li>)}</ul></section>}

      {tab === "security" && <section><h2 className="text-2xl font-bold">Security controls</h2><div className="mt-4 flex max-w-2xl items-center justify-between gap-3 rounded-lg border border-border p-4"><div><b>Lockdown {settings.lockdown ? "ON" : "off"}</b><p className="text-xs text-muted-foreground">When enabled, players cannot access games.</p></div><Button variant="outline" onClick={async () => { await save({ data: { lockdown: !settings.lockdown } }); await refresh(); }}>{settings.lockdown ? "Turn off" : "Turn on"}</Button></div><div className="mt-3 flex max-w-2xl items-center justify-between gap-3 rounded-lg border border-border p-4"><div><b>Kick everyone</b><p className="text-xs text-muted-foreground">Immediately signs out all players.</p></div><Button variant="outline" onClick={async () => { if (confirm("Kick everyone out?")) { await save({ data: { kickAll: true } }); await refresh(); } }}>Kick all</Button></div><h3 className="mt-8 text-xl font-bold">Banned browser IDs</h3><p className="mt-1 text-sm text-muted-foreground">Browser IDs are resettable and are not hardware identifiers.</p><form className="mt-3 flex max-w-lg gap-2" onSubmit={async (event) => { event.preventDefault(); const result = await ban({ data: { deviceId: banId, banned: true } }); if (!result.ok) alert("Could not add that ban."); else setBanId(""); await refresh(); }}><input value={banId} onChange={(event) => setBanId(event.target.value)} placeholder="Browser UUID" pattern={DEVICE_ID_PATTERN.source} required className="min-w-0 flex-1 rounded border border-border bg-background px-3 py-2 text-sm"/><Button type="submit">Ban</Button></form><ul className="mt-3 max-w-2xl space-y-2">{bans.length === 0 && <li className="text-sm text-muted-foreground">Nobody banned.</li>}{bans.map((item) => <li key={item.device_id} className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2 text-sm"><span className="break-all font-mono">{item.device_id}{item.note && <span className="ml-2 font-sans text-muted-foreground">({item.note})</span>}</span><Button variant="outline" size="sm" className={btn} onClick={async () => { await ban({ data: { deviceId: item.device_id, banned: false } }); await refresh(); }}>Unban</Button></li>)}</ul></section>}

      {tab === "activity" && <section><div className="flex items-center justify-between gap-3"><h2 className="text-2xl font-bold">Recent activity</h2><Button variant="outline" size="sm" className={btn} onClick={async () => { if (confirm("Clear the activity list?")) { await clearLog(); await refresh(); } }}>Clear activity</Button></div><p className="mt-1 text-sm text-muted-foreground">Most recent 50 entries.</p><ul className="mt-3 space-y-1 text-sm">{log.length === 0 && <li className="text-muted-foreground">Nothing yet.</li>}{log.map((entry, index) => { const failure = ["wrong", "admin_wrong", "blocked", "tripwire"].includes(entry.kind); const success = ["code", "login", "admin_login"].includes(entry.kind); return <li key={`${entry.at}-${index}`} className="flex flex-wrap justify-between gap-2 border-b border-border py-3"><div className="min-w-0 flex-1 basis-64 space-y-2 break-words"><span className={`inline-block rounded px-2 py-1 text-xs font-semibold ${failure ? "bg-destructive/10 text-destructive" : success ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{failure ? "Failed / blocked" : success ? "Success" : entry.kind}</span><p>{entry.detail}</p>{entry.attempted_input !== null && <p className="break-all font-mono text-xs">Entered: {entry.attempted_input || "(empty)"}</p>}{entry.device_id && <DeviceControls id={entry.device_id} onBan={() => banDevice(entry.device_id ?? "", "Activity review")} />}</div><time className="text-xs text-muted-foreground">{when(entry.at)}</time></li>; })}</ul></section>}
    </div>
  </main>;
}

function StatCard({ label, value, detail, accent }: { label: string; value: number; detail: string; accent: string }) {
  return <article className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5"><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-2 text-3xl font-bold tabular-nums ${accent}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>;
}

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
  return <div className="min-h-screen bg-background p-8 font-serif text-foreground"><h1 className="text-center text-3xl font-bold">404 Not Found</h1><hr className="my-4 border-border"/><p className="text-center">nginx/1.24.0 <Button variant="ghost" type="button" aria-label="." onClick={() => setOpen((value) => !value)} className="h-auto rounded-none p-0 font-serif text-base cursor-default hover:bg-transparent">.</Button></p>{open && <form onSubmit={onSubmit} className="mx-auto mt-10 flex max-w-xs gap-2"><input name="password" type="password" maxLength={200} autoFocus autoComplete="off" className="min-w-0 flex-1 border border-border bg-background px-2 py-1 text-sm"/><Button variant="outline" size="sm" type="submit" className="border border-border px-3 text-sm">→</Button></form>}</div>;
}

function DeviceControls({ id, onBan }: { id: string; onBan: () => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  return <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs"><code className="break-all">{id}</code><Button variant="ghost" size="icon" className="h-7 w-7" title={copied ? "Copied" : "Copy Device ID"} aria-label="Copy Device ID" onClick={async () => { await navigator.clipboard.writeText(id); setCopied(true); }}><Copy /></Button><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Ban Device" aria-label="Ban Device" onClick={() => void onBan()}><Ban /></Button></div>;
}
