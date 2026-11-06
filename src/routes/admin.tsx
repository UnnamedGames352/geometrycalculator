import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { adminLogin, clearActivity, getActivity, saveSettings, updateFriend, createCode, createFriend, deleteCode, deleteFriend, listCodes, listFriends, lockAdmin, listBans, setBan, messageFriend } from "@/lib/gate.functions";
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
  loader: async () => ({ ...(await listCodes()), ...(await listFriends()), ...(await getActivity()), ...(await listBans()) }),
  component: Admin,
});

const when = (t: string | null) => (t ? new Date(t).toLocaleString() : "never");
const mins = (t: string) => { const m = Math.floor((Date.now() - new Date(t).getTime()) / 60000); return m < 1 ? "under a minute" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
const btn = "rounded border border-border px-2 py-1 text-xs";

function Admin() {
  const { admin, codes, friends, log, settings, bans } = Route.useLoaderData();
  const ban = useServerFn(setBan);
  const note = useServerFn(messageFriend);
  const [banIp, setBanIp] = useState("");
  const addFriend = useServerFn(createFriend);
  const removeFriend = useServerFn(deleteFriend);
  const kick = useServerFn(kickFriend);
  const editFriend = useServerFn(updateFriend);
  const save = useServerFn(saveSettings);
  const clearLog = useServerFn(clearActivity);
  const [friendName, setFriendName] = useState("");
  const router = useRouter();
  const make = useServerFn(createCode);
  const remove = useServerFn(deleteCode);
  const lock = useServerFn(lockAdmin);

  const [tabOk, setTabOk] = useState<boolean | null>(null);

  useEffect(() => {
    // Admin access only lasts for the tab that entered the passcode.
    const ok = sessionStorage.getItem("admin-tab") === "1";
    setTabOk(ok);
    if (admin && !ok) lock().then(() => router.invalidate());
  }, [admin]);

  // Live view: refresh every 5 seconds.
  useEffect(() => {
    if (!admin || !tabOk) return;
    const id = setInterval(() => router.invalidate(), 5000);
    return () => clearInterval(id);
  }, [admin, tabOk]);

  if (admin && tabOk === null) return null;
  if (!admin || !tabOk) {
    return <AdminGate />;
  }

  const refresh = () => router.invalidate();
  async function edit(id: string, patch: Omit<Parameters<typeof editFriend>[0]["data"], "id">) {
    const r = await editFriend({ data: { id, ...patch } });
    if (!r.ok) alert(r.error);
    await refresh();
  }

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-background p-8 text-foreground">
      <h1 className="text-2xl font-bold">Site controls</h1>
      <div className={`mt-4 rounded border p-3 ${settings.lockdown ? "border-destructive" : "border-border"}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Lockdown {settings.lockdown ? "ON" : "off"}</div>
            <div className="text-xs text-muted-foreground">When on, everyone except you sees the fake 404.</div>
          </div>
          <button className={btn} onClick={async () => { await save({ data: { lockdown: !settings.lockdown } }); await refresh(); }}>
            {settings.lockdown ? "Turn off" : "Turn on"}
          </button>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between rounded border border-border p-3">
        <div>
          <div className="font-medium">Kick everyone</div>
          <div className="text-xs text-muted-foreground">Signs out every friend and code user right now.</div>
        </div>
        <button className={btn} onClick={async () => { if (confirm("Kick everyone out?")) { await save({ data: { kickAll: true } }); await refresh(); } }}>Kick all</button>
      </div>

      <h2 className="mt-10 text-xl font-bold">One-time codes</h2>
      <p className="mt-1 text-sm text-muted-foreground">Each code works once, then disappears.</p>
      <button className="mt-4 rounded bg-primary px-4 py-2 text-primary-foreground" onClick={async () => { await make(); await refresh(); }}>
        Make a new code
      </button>
      <ul className="mt-6 space-y-2">
        {codes.length === 0 && <li className="text-sm text-muted-foreground">No unused codes.</li>}
        {codes.map((c) => (
          <li key={c} className="flex items-center justify-between rounded border border-border px-3 py-2 font-mono">
            {c}
            <button className="text-sm text-muted-foreground" onClick={async () => { await remove({ data: { code: c } }); await refresh(); }}>delete</button>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-xl font-bold">Friend passwords</h2>
      <p className="mt-1 text-sm text-muted-foreground">Reusable, but only one device at a time. Signing in somewhere new kicks out the old one.</p>
      <form className="mt-4 flex gap-2" onSubmit={async (e) => { e.preventDefault(); await addFriend({ data: { name: friendName } }); setFriendName(""); await refresh(); }}>
        <input value={friendName} onChange={(e) => setFriendName(e.target.value)} placeholder="Friend's name"
          className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm" />
        <button type="submit" className="rounded bg-primary px-4 py-2 text-primary-foreground">Add</button>
      </form>
      <ul className="mt-4 space-y-2">
        {friends.length === 0 && <li className="text-sm text-muted-foreground">No friend passwords yet.</li>}
        {friends.map((f) => {
          const expired = !!f.expires_at && new Date(f.expires_at) < new Date();
          return (
            <li key={f.id} className={`rounded border border-border px-3 py-2 ${f.paused || expired ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium">{f.name || "(no name)"}</span>
                <span className="text-xs text-muted-foreground">
                  {f.paused ? "paused" : expired ? "expired" : f.online ? "signed in" : "not signed in"}
                </span>
              </div>
              <div className="mt-1 font-mono">{f.password}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Last sign-in: {when(f.last_login)} · Last seen: {when(f.last_seen)}
                {f.expires_at && <> · Expires: {when(f.expires_at)}</>}
              </div>
              {f.online && !f.paused && !expired && (
                <div className="mt-1 text-sm">
                  {f.current_game ? <>Playing <b>{f.current_game}</b></> : "On the games list"}
                  {f.game_started_at && <span className="text-xs text-muted-foreground"> · for {mins(f.game_started_at)}</span>}
                </div>
              )}
              {f.message && <div className="mt-1 text-xs text-muted-foreground">Note waiting to be seen: “{f.message}”</div>}
              {f.device && (
                <div className="mt-1 text-xs text-muted-foreground" title={f.user_agent ?? ""}>
                  {f.online ? "Signed in on" : "Last device"}: {f.device}
                  {f.location && <> · {f.location}</>}
                  {f.ip && <> · IP {f.ip}</>}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button className={btn} onClick={() => { const n = prompt("New name", f.name); if (n !== null) edit(f.id, { name: n }); }}>rename</button>
                <button className={btn} onClick={() => { const p = prompt("New password (leave empty for a random one)"); if (p !== null) edit(f.id, p.trim() ? { password: p } : { newRandom: true }); }}>change password</button>
                <button className={btn} onClick={() => edit(f.id, { paused: !f.paused })}>{f.paused ? "unpause" : "pause"}</button>
                <button className={btn} onClick={() => {
                  const d = prompt("Expire after how many days? (empty = never)", "");
                  if (d === null) return;
                  const days = Number(d);
                  edit(f.id, { expires_at: d.trim() && days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null });
                }}>expiry</button>
                <button className={btn} onClick={async () => { const m = prompt(`Message to ${f.name}`); if (m?.trim()) { await note({ data: { id: f.id, message: m } }); await refresh(); } }}>message</button>
                {f.ip && <button className={btn} onClick={async () => { if (confirm(`Ban this computer (IP ${f.ip})?`)) { await ban({ data: { ip: f.ip!, note: f.name, banned: true } }); await refresh(); } }}>ban computer</button>}
                {f.online && <button className={btn} onClick={async () => { try { await kick({ data: { id: f.id } }); } catch (e) { alert((e as Error).message); } await refresh(); }}>kick out</button>}
                <button className={btn} onClick={async () => { if (confirm("Delete this password?")) { await removeFriend({ data: { id: f.id } }); await refresh(); } }}>delete</button>
              </div>
            </li>
          );
        })}
      </ul>

      <h2 className="mt-10 text-xl font-bold">Banned computers</h2>
      <p className="mt-1 text-sm text-muted-foreground">Banned IP addresses can't sign in and get kicked out. Find IPs in the activity list.</p>
      <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); await ban({ data: { ip: banIp, banned: true } }); setBanIp(""); await refresh(); }}>
        <input value={banIp} onChange={(e) => setBanIp(e.target.value)} placeholder="IP address"
          className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm" />
        <button type="submit" className="rounded bg-primary px-4 py-2 text-primary-foreground">Ban</button>
      </form>
      <ul className="mt-3 space-y-2">
        {bans.length === 0 && <li className="text-sm text-muted-foreground">Nobody banned.</li>}
        {bans.map((b) => (
          <li key={b.ip} className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm">
            <span className="font-mono">{b.ip}{b.note && <span className="ml-2 font-sans text-muted-foreground">({b.note})</span>}</span>
            <button className={btn} onClick={async () => { await ban({ data: { ip: b.ip, banned: false } }); await refresh(); }}>unban</button>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-xl font-bold">Activity</h2>
        <button className={btn} onClick={async () => { if (confirm("Clear the activity list?")) { await clearLog(); await refresh(); } }}>clear</button>
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {log.length === 0 && <li className="text-muted-foreground">Nothing yet.</li>}
        {log.map((l, i) => (
          <li key={i} className={`flex justify-between gap-3 border-b border-border py-1 ${l.kind === "wrong" || l.kind === "blocked" ? "text-destructive" : ""}`}>
            <span>{l.detail}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{when(l.at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdminGate() {
  const router = useRouter();
  const login = useServerFn(adminLogin);
  const [open, setOpen] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = new FormData(e.currentTarget).get("password") as string;
    const { ok } = await login({ data: { password } });
    if (ok) { sessionStorage.setItem("admin-tab", "1"); await router.invalidate(); }
    else await router.navigate({ to: "/geometry" });
  }

  return (
    <div className="min-h-screen bg-background p-8 font-serif text-foreground">
      <h1 className="text-center text-3xl font-bold">404 Not Found</h1>
      <hr className="my-4 border-border" />
      <p className="text-center">
        nginx/1.24.0
        {/* Secret button: the period is clickable */}
        <button type="button" aria-label="." onClick={() => setOpen((o) => !o)} className="cursor-default">.</button>
      </p>
      {open && (
        <form onSubmit={onSubmit} className="mx-auto mt-10 flex max-w-xs gap-2">
          <input name="password" type="password" autoFocus autoComplete="off"
            className="flex-1 border border-border bg-background px-2 py-1 text-sm" />
          <button type="submit" className="border border-border px-3 text-sm">→</button>
        </form>
      )}
    </div>
  );
}
