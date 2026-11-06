import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  adminLogin,
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
import { kickFriend } from "@/lib/kick.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "404 Not Found" },
      { name: "description", content: "The requested page could not be found." },
      { property: "og:title", content: "404 Not Found" },
      { property: "og:description", content: "The requested page could not be found." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async () => ({
    ...(await listCodes()),
    ...(await listFriends()),
    ...(await getActivity()),
    ...(await listBans()),
  }),
  component: Admin,
});

const when = (t: string | null) => (t ? new Date(t).toLocaleString() : "never");
const mins = (t: string) => {
  const m = Math.floor((Date.now() - new Date(t).getTime()) / 60_000);
  return m < 1 ? "under a minute" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const btn = "rounded border border-border px-2 py-1 text-xs hover:bg-accent";
const onlineWindowMs = 2 * 60_000;

function Admin() {
  const { admin, codes, friends, log, settings, bans } = Route.useLoaderData();
  const ban = useServerFn(setBan);
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
  const [friendName, setFriendName] = useState("");
  const [banIp, setBanIp] = useState("");
  const [tabOk, setTabOk] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    const ok = sessionStorage.getItem("admin-tab") === "1";
    setTabOk(ok);
    if (admin && !ok) lock().then(() => router.invalidate());
  }, [admin]);

  // Keep the dashboard and active-device list fresh while the admin is open.
  useEffect(() => {
    if (!admin || !tabOk) return;
    const id = setInterval(() => router.invalidate(), 5000);
    return () => clearInterval(id);
  }, [admin, tabOk]);

  if (admin && tabOk === null) return null;
  if (!admin || !tabOk) return <AdminGate />;

  const refresh = () => router.invalidate();
  const onlineFriends = friends.filter((f) => {
    if (!f.online || f.paused || (f.expires_at && new Date(f.expires_at) < new Date())) return false;
    return !!f.last_seen && Date.now() - new Date(f.last_seen).getTime() < onlineWindowMs;
  });
  const playingFriends = onlineFriends.filter((f) => f.current_game);
  const hubFriends = onlineFriends.filter((f) => !f.current_game);

  async function edit(id: string, patch: Omit<Parameters<typeof editFriend>[0]["data"], "id">) {
    const result = await editFriend({ data: { id, ...patch } });
    if (!result.ok) alert(result.error);
    await refresh();
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl bg-background p-5 text-foreground sm:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Live overview</p>
          <h1 className="mt-1 text-3xl font-bold">Site controls</h1>
          <p className="mt-1 text-sm text-muted-foreground">Activity refreshes every 5 seconds.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${settings.lockdown ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>
          {settings.lockdown ? "Lockdown on" : "Site open"}
        </span>
      </header>

      <section aria-label="Live site statistics" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Friends online" value={onlineFriends.length} detail="Active in the last 2 minutes" accent="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="Playing now" value={playingFriends.length} detail="Friends currently in a game" accent="text-violet-600 dark:text-violet-400" />
        <StatCard label="On the hub" value={hubFriends.length} detail="Online, not in a game" accent="text-sky-600 dark:text-sky-400" />
        <StatCard label="Unused codes" value={codes.length} detail="One-time codes ready to use" accent="text-amber-600 dark:text-amber-400" />
      </section>

      <section className="mt-6 rounded-xl border border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Friends online now</h2>
            <p className="mt-1 text-sm text-muted-foreground">Shows current game and last reported browser/device. A browser ID is not a hardware serial number.</p>
          </div>
          <span className="text-xs text-muted-foreground">{onlineFriends.length} active</span>
        </div>
        {onlineFriends.length === 0 ? (
          <p className="mt-4 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">No friends have checked in during the last two minutes.</p>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {onlineFriends.map((f) => (
              <li key={f.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{f.name || "(no name)"}</p>
                    <p className="mt-1 text-sm">
                      {f.current_game ? <>Playing <strong>{f.current_game}</strong></> : "Browsing the games hub"}
                      {f.game_started_at && f.current_game && <span className="text-muted-foreground"> · {mins(f.game_started_at)}</span>}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">Online</span>
                </div>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <p><span className="font-medium text-foreground">Device:</span> {f.device || "Not reported"}</p>
                  {f.location && <p><span className="font-medium text-foreground">Location:</span> {f.location}</p>}
                  <p><span className="font-medium text-foreground">Last seen:</span> {when(f.last_seen)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`mt-8 rounded-lg border p-4 ${settings.lockdown ? "border-destructive" : "border-border"}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Lockdown {settings.lockdown ? "ON" : "off"}</h2>
            <p className="text-xs text-muted-foreground">When on, everyone except you sees the fake 404.</p>
          </div>
          <button className={btn} onClick={async () => { await save({ data: { lockdown: !settings.lockdown } }); await refresh(); }}>
            {settings.lockdown ? "Turn off" : "Turn on"}
          </button>
        </div>
      </section>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border p-4">
        <div>
          <h2 className="font-semibold">Kick everyone</h2>
          <p className="text-xs text-muted-foreground">Signs out every friend and code user right now.</p>
        </div>
        <button className={btn} onClick={async () => { if (confirm("Kick everyone out?")) { await save({ data: { kickAll: true } }); await refresh(); } }}>Kick all</button>
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-bold">One-time codes</h2>
        <p className="mt-1 text-sm text-muted-foreground">Each code works once, then disappears.</p>
        <button className="mt-3 rounded bg-primary px-4 py-2 text-sm text-primary-foreground" onClick={async () => { await make(); await refresh(); }}>Make a new code</button>
        <ul className="mt-4 space-y-2">
          {codes.length === 0 && <li className="text-sm text-muted-foreground">No unused codes.</li>}
          {codes.map((code) => (
            <li key={code} className="flex items-center justify-between rounded border border-border px-3 py-2 font-mono">
              {code}
              <button className={btn} onClick={async () => { await removeCode({ data: { code } }); await refresh(); }}>delete</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold">Friend passwords</h2>
        <p className="mt-1 text-sm text-muted-foreground">Reusable, but only one device at a time. Signing in somewhere new kicks out the old one.</p>
        <form className="mt-3 flex gap-2" onSubmit={async (event) => { event.preventDefault(); await addFriend({ data: { name: friendName } }); setFriendName(""); await refresh(); }}>
          <input value={friendName} onChange={(event) => setFriendName(event.target.value)} placeholder="Friend's name" className="min-w-0 flex-1 rounded border border-border bg-background px-3 py-2 text-sm" />
          <button type="submit" className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground">Add</button>
        </form>
        <ul className="mt-4 space-y-3">
          {friends.length === 0 && <li className="text-sm text-muted-foreground">No friend passwords yet.</li>}
          {friends.map((f) => {
            const expired = !!f.expires_at && new Date(f.expires_at) < new Date();
            const active = onlineFriends.some((online) => online.id === f.id);
            return (
              <li key={f.id} className={`rounded-lg border border-border p-4 ${f.paused || expired ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{f.name || "(no name)"}</span>
                  <span className="text-xs text-muted-foreground">{f.paused ? "paused" : expired ? "expired" : active ? "online" : f.online ? "session active / stale" : "offline"}</span>
                </div>
                <div className="mt-1 font-mono text-sm">{f.password}</div>
                <div className="mt-1 text-xs text-muted-foreground">Last sign-in: {when(f.last_login)} · Last seen: {when(f.last_seen)}{f.expires_at && <> · Expires: {when(f.expires_at)}</>}</div>
                {active && <div className="mt-2 text-sm">{f.current_game ? <>Playing <b>{f.current_game}</b>{f.game_started_at && <span className="text-xs text-muted-foreground"> · for {mins(f.game_started_at)}</span>}</> : "On the games list"}</div>}
                {f.message && <div className="mt-1 text-xs text-muted-foreground">Note waiting to be seen: “{f.message}”</div>}
                {f.device && <div className="mt-1 text-xs text-muted-foreground" title={f.user_agent ?? ""}>{active ? "Signed in on" : "Last device"}: {f.device}{f.location && <> · {f.location}</>}{f.ip && <> · IP {f.ip}</>}</div>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className={btn} onClick={() => { const name = prompt("New name", f.name); if (name !== null) void edit(f.id, { name }); }}>rename</button>
                  <button className={btn} onClick={() => { const password = prompt("New password (leave empty for a random one)"); if (password !== null) void edit(f.id, password.trim() ? { password } : { newRandom: true }); }}>change password</button>
                  <button className={btn} onClick={() => void edit(f.id, { paused: !f.paused })}>{f.paused ? "unpause" : "pause"}</button>
                  <button className={btn} onClick={() => { const daysText = prompt("Expire after how many days? (empty = never)", ""); if (daysText === null) return; const days = Number(daysText); void edit(f.id, { expires_at: daysText.trim() && days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null }); }}>expiry</button>
                  <button className={btn} onClick={async () => { const message = prompt(`Message to ${f.name}`); if (message?.trim()) { await note({ data: { id: f.id, message } }); await refresh(); } }}>message</button>
                  {f.ip && <button className={btn} onClick={async () => { if (confirm(`Ban this computer's IP (${f.ip})? This can affect others on shared Wi-Fi.`)) { await ban({ data: { ip: f.ip!, note: f.name, banned: true } }); await refresh(); } }}>ban IP</button>}
                  {f.online && <button className={btn} onClick={async () => { try { await kick({ data: { id: f.id } }); } catch (error) { alert((error as Error).message); } await refresh(); }}>kick out</button>}
                  <button className={btn} onClick={async () => { if (confirm("Delete this password?")) { await removeFriend({ data: { id: f.id } }); await refresh(); } }}>delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold">Banned IP addresses</h2>
        <p className="mt-1 text-sm text-muted-foreground">IP bans may affect everyone sharing the same school Wi-Fi. Device-specific bans are not connected yet.</p>
        <form className="mt-3 flex gap-2" onSubmit={async (event) => { event.preventDefault(); const result = await ban({ data: { ip: banIp, banned: true } }); if (!result.ok) alert("Could not add that ban."); else setBanIp(""); await refresh(); }}>
          <input value={banIp} onChange={(event) => setBanIp(event.target.value)} placeholder="IP address" className="min-w-0 flex-1 rounded border border-border bg-background px-3 py-2 text-sm" />
          <button type="submit" className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground">Ban</button>
        </form>
        <ul className="mt-3 space-y-2">
          {bans.length === 0 && <li className="text-sm text-muted-foreground">Nobody banned.</li>}
          {bans.map((item) => (
            <li key={item.ip} className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2 text-sm">
              <span className="break-all font-mono">{item.ip}{item.note && <span className="ml-2 font-sans text-muted-foreground">({item.note})</span>}</span>
              <button className={btn} onClick={async () => { await ban({ data: { ip: item.ip, banned: false } }); await refresh(); }}>unban</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Recent activity</h2>
          <button className={btn} onClick={async () => { if (confirm("Clear the activity list?")) { await clearLog(); await refresh(); } }}>clear</button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Most recent 50 entries.</p>
        <ul className="mt-3 space-y-1 text-sm">
          {log.length === 0 && <li className="text-muted-foreground">Nothing yet.</li>}
          {log.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className={`flex justify-between gap-3 border-b border-border py-2 ${entry.kind === "wrong" || entry.kind === "blocked" ? "text-destructive" : ""}`}>
              <span className="min-w-0 break-words">{entry.detail}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{when(entry.at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function StatCard({ label, value, detail, accent }: { label: string; value: number; detail: string; accent: string }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${accent}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}

function AdminGate() {
  const router = useRouter();
  const login = useServerFn(adminLogin);
  const [open, setOpen] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password") as string;
    const { ok } = await login({ data: { password } });
    if (ok) {
      sessionStorage.setItem("admin-tab", "1");
      await router.invalidate();
    } else {
      await router.navigate({ to: "/geometry" });
    }
  }

  return (
    <div className="min-h-screen bg-background p-8 font-serif text-foreground">
      <h1 className="text-center text-3xl font-bold">404 Not Found</h1>
      <hr className="my-4 border-border" />
      <p className="text-center">
        nginx/1.24.0
        {/* Secret button: the period is clickable */}
        <button type="button" aria-label="." onClick={() => setOpen((value) => !value)} className="cursor-default">.</button>
      </p>
      {open && (
        <form onSubmit={onSubmit} className="mx-auto mt-10 flex max-w-xs gap-2">
          <input name="password" type="password" autoFocus autoComplete="off" className="flex-1 border border-border bg-background px-2 py-1 text-sm" />
          <button type="submit" className="border border-border px-3 text-sm">→</button>
        </form>
      )}
    </div>
  );
}
