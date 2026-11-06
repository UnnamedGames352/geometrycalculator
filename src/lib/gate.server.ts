import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

// friendId/token are set when a friend signs in with a personal password;
// only the most recent sign-in token for that password stays valid.
// at = when this browser was unlocked (used by "kick everyone").
type GateSession = { unlocked?: boolean; admin?: boolean; friendId?: string | undefined; token?: string | undefined; at?: number };

const config = () => ({
  password: process.env["SESSION_SECRET"]!,
  name: "site-gate",
  cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
});

export const getGateSession = () => useSession<GateSession>(config());

export type SiteSettings = { lockdown: boolean; hidden_games: string[]; kick_all_at: string | null };

export async function getSettings(): Promise<SiteSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("site_settings").select("lockdown, hidden_games, kick_all_at").eq("id", 1).maybeSingle();
  return data ?? { lockdown: false, hidden_games: [], kick_all_at: null };
}

// Every log entry also records which computer it came from.
export async function logActivity(kind: string, detail = "") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let extra = "";
  try {
    const d = await deviceInfo();
    extra = ` — ${[d.device, d.location, d.ip && `IP ${d.ip}`].filter(Boolean).join(" · ")}`;
  } catch { /* no request */ }
  await supabaseAdmin.from("activity_log").insert({ kind, detail: (detail.slice(0, 80) + extra).slice(0, 300) });
}

/** markSeen: update the friend's "last seen" time (done on hub loads, not every game file). */
export async function isUnlocked(opts: { markSeen?: boolean } = {}) {
  const s = await getGateSession();
  if (!s.data.unlocked) return false;
  if (s.data.admin) return true;
  const settings = await getSettings();
  if (settings.lockdown) return false;
  if (settings.kick_all_at && (s.data.at ?? 0) < new Date(settings.kick_all_at).getTime()) return false;
  if (opts.markSeen && (await isBanned())) return false;
  if (!s.data.friendId) return true;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("friend_passwords").select("active_session, paused, expires_at").eq("id", s.data.friendId).maybeSingle();
  if (!data || data.active_session !== s.data.token || data.paused) return false;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
  if (opts.markSeen) await supabaseAdmin.from("friend_passwords").update({ last_seen: new Date().toISOString() }).eq("id", s.data.friendId);
  return true;
}

export async function isHidden(repo: string) {
  const s = await getGateSession();
  if (s.data.admin) return false;
  return (await getSettings()).hidden_games.includes(repo);
}

export function passwordMatches(input: string, expected: string) {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function deviceInfo() {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const ua = getRequestHeader("user-agent") ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Unknown browser";
  const os = /CrOS/.test(ua) ? "Chromebook" : /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android phone" : "Android tablet") : /Windows/.test(ua) ? "Windows PC" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Unknown device";
  const ip = getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const loc = [getRequestHeader("cf-ipcity"), getRequestHeader("cf-region"), getRequestHeader("cf-ipcountry")].filter(Boolean).join(", ");
  return { device: `${browser} on ${os}`, ip, location: loc || null, user_agent: ua.slice(0, 300) };
}


export async function isBanned() {
  const { ip } = await deviceInfo();
  if (!ip) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("banned_ips").select("ip").eq("ip", ip).maybeSingle();
  return !!data;
}

/** Live view: remember which game a signed-in friend is on (null = on the hub). */
export async function setCurrentGame(repo: string | null) {
  const s = await getGateSession();
  if (!s.data.friendId || s.data.admin) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("friend_passwords").select("current_game").eq("id", s.data.friendId).maybeSingle();
  if (data && data.current_game !== repo)
    await supabaseAdmin.from("friend_passwords").update({ current_game: repo, game_started_at: new Date().toISOString() }).eq("id", s.data.friendId);
}

/** Pending note from the admin for this friend; ack clears it. */
export async function takeMessage(ack: boolean) {
  const s = await getGateSession();
  if (!s.data.friendId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (ack) { await supabaseAdmin.from("friend_passwords").update({ message: null }).eq("id", s.data.friendId); return null; }
  const { data } = await supabaseAdmin.from("friend_passwords").select("message").eq("id", s.data.friendId).maybeSingle();
  return data?.message ?? null;
}

// Injected into the hub and every game page: kick check, admin notes,
// panic key (Esc twice -> geometry page) and 15-minute idle lock.
export const guardScript = `<script>(()=>{const T=window.top,go=u=>{try{T.sessionStorage.removeItem('gate-tab')}catch{}T.location.replace(u)};
const touch=()=>{try{T.sessionStorage.setItem('last-active',Date.now())}catch{}};touch();
['mousemove','mousedown','keydown','touchstart','wheel'].forEach(e=>addEventListener(e,touch,{passive:true,capture:true}));
let last=0;addEventListener('keydown',e=>{if(e.key==='Escape'){const n=Date.now();if(n-last<700)go('/geometry');last=n}},true);
let busy=false;const check=async()=>{if(busy)return;busy=true;try{const a=+T.sessionStorage.getItem('last-active')||Date.now();if(Date.now()-a>900000){go('/');return}
const r=await fetch('/hub?session-check=1',{cache:'no-store',credentials:'same-origin'});const s=await r.json();if(!s.unlocked){go('/');return}
if(s.message&&window===T.frames[0]){alert(s.message);await fetch('/hub?session-check=1&ack=1',{cache:'no-store'})}}catch{}finally{busy=false}};
void check();setInterval(check,2000)})()</script>`;
