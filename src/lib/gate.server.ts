import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { DEVICE_ID_PATTERN, isChromeOSChrome } from "./security-rules";
export { guardScript } from "./guard-script";

// The device ID is a random browser-local identifier, not a hardware serial number.
type GateSession = {
  unlocked?: boolean;
  admin?: boolean;
  friendId?: string | undefined;
  token?: string | undefined;
  deviceId?: string | undefined;
  at?: number;
};

const config = () => {
  const password = process.env["SESSION_SECRET"];
  if (!password) throw new Error("Session unavailable");
  return ({
  password,
  name: "site-gate",
  cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
});
};

export const getGateSession = () => useSession<GateSession>(config());

export type SiteSettings = { lockdown: boolean; hidden_games: string[]; kick_all_at: string | null };

export async function getSettings(): Promise<SiteSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("site_settings").select("lockdown, hidden_games, kick_all_at").eq("id", 1).maybeSingle();
  if (error) throw new Error("Could not check site settings");
  return data ?? { lockdown: false, hidden_games: [], kick_all_at: null };
}

// Every activity entry includes the browser ID when one has been assigned, so an
// admin can copy it into the device-ban manager. IPs remain diagnostic only.
export async function logActivity(kind: string, detail = "", deviceId?: string, attemptedInput?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [d, session] = await Promise.all([deviceInfo(), getGateSession()]);
  const id = deviceId ?? session.data.deviceId;
  const { error } = await supabaseAdmin.from("activity_log").insert({ kind, detail: `${detail} — ${[d.device, d.location, d.ip && `IP ${d.ip}`].filter(Boolean).join(" · ")}`.slice(0,1000), device: d.device, device_id: id && DEVICE_ID_PATTERN.test(id) ? id : null, attempted_input: attemptedInput ?? null });
  if (error) throw new Error("Could not record activity");
}

export async function evictUsers(lockdown?: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("evict_gate_users", lockdown === undefined ? {} : { p_lockdown: lockdown });
  if (error) throw new Error("Could not evict sessions");
}

export async function enforceChromebook(deviceId?: string) {
  const d = await deviceInfo();
  if (isChromeOSChrome(d.user_agent)) return true;
  await evictUsers(true);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (deviceId && DEVICE_ID_PATTERN.test(deviceId)) {
    const { error } = await supabaseAdmin.from("banned_devices").upsert({ device_id: deviceId, note: "Tripwire: Non-Chromebook attempt" });
    if (error) throw new Error("Could not ban browser");
  }
  await logActivity("tripwire", `TRIPWIRE: Non-Chromebook attempted access (${d.device}). Initiated lockdown and kicked all users.`, deviceId);
  const session = await getGateSession();
  await session.clear();
  return false;
}

export async function failedAttempt(kind: "wrong" | "admin_wrong", input: string, deviceId: string) {
  await logActivity(kind, kind === "wrong" ? "Wrong code or password" : "Wrong admin password", deviceId, input);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("record_device_failure", { p_device_id: deviceId });
  if (error) throw new Error("Could not record failed attempt");
  if (data) await logActivity("blocked", "Auto-ban: 3 failed attempts within 5 minutes", deviceId);
}

export async function isAdmin() {
  const s = await getGateSession();
  if (!s.data.admin || !(await enforceChromebook(s.data.deviceId))) return false;
  return !!s.data.deviceId && !(await isDeviceBanned(s.data.deviceId));
}

/** markSeen: update the friend's "last seen" time (done on hub loads, not every game file). */
export async function isUnlocked(opts: { markSeen?: boolean } = {}) {
  const s = await getGateSession();
  if (!s.data.unlocked) return false;
  if (!s.data.deviceId || !isChromeOSChrome((await deviceInfo()).user_agent)) return false;
  if (s.data.admin) return isAdmin();
  const settings = await getSettings();
  if (settings.lockdown) return false;
  if (settings.kick_all_at && (s.data.at ?? 0) < new Date(settings.kick_all_at).getTime()) return false;
  if (s.data.deviceId && await isDeviceBanned(s.data.deviceId)) return false;
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

export async function isDeviceBanned(deviceId: string) {
  if (!DEVICE_ID_PATTERN.test(deviceId)) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("banned_devices").select("device_id").eq("device_id", deviceId).maybeSingle();
  if (error) throw new Error("Could not check browser ban");
  return !!data;
}

// Compatibility for older callers; bans are now checked using the browser ID in session.
export async function isBanned() {
  const session = await getGateSession();
  return session.data.deviceId ? isDeviceBanned(session.data.deviceId) : false;
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

