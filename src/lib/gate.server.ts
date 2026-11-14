import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { DEVICE_ID_PATTERN, isChromeOSChrome, creditSeconds, addPlaytime } from "./security-rules";
export { guardScript } from "./guard-script";

// The device ID is a random browser-local identifier, not a hardware serial number.
type GateSession = {
  unlocked?: boolean;
  admin?: boolean;
  friendId?: string | undefined;
  token?: string | undefined;
  deviceId?: string | undefined;
  at?: number;
  tripwireNotice?: boolean;
  tripwireNoticeShown?: boolean;
  adminSessionToken?: string | undefined;
  adminRole?: 'owner' | 'admin' | 'moderator' | 'support' | undefined;
  pendingAdminAuth?: boolean | undefined;
  pendingAdminAt?: number | undefined;
  pendingAdminAttempts?: number | undefined;
  pendingTotpSecret?: string | undefined;
  pendingStaffId?: string | undefined;
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

export type SiteSettings = { lockdown: boolean; lockdown_level: number; hidden_games: string[]; kick_all_at: string | null; broadcast_message: string | null };

export async function getSettings(): Promise<SiteSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("site_settings").select("lockdown, lockdown_level, hidden_games, kick_all_at, broadcast_message").eq("id", 1).maybeSingle();
  if (error) throw new Error("Could not check site settings");
  return data ?? { lockdown: false, lockdown_level: 1, hidden_games: [], kick_all_at: null, broadcast_message: null };
}

// Every activity entry includes the browser ID when one has been assigned, so an
// admin can copy it into the device-ban manager. IPs remain diagnostic only.
export async function logActivity(kind: string, detail = "", deviceId?: string, attemptedInput?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [d, session] = await Promise.all([deviceInfo(), getGateSession()]);
  const id = deviceId ?? session.data.deviceId;
  const { error } = await supabaseAdmin.from("activity_log").insert({ kind, detail: `${detail} — ${[d.device, d.location, d.ip && `IP ${d.ip}`].filter(Boolean).join(" · ")}`.slice(0,1000), device: d.device, device_id: id && DEVICE_ID_PATTERN.test(id) ? id : null, attempted_input: null });
  if (error) throw new Error("Could not record activity");
}

export async function evictUsers(lockdown?: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("evict_gate_users", lockdown === undefined ? {} : { p_lockdown: lockdown });
  if (error) throw new Error("Could not evict sessions");
}

const TRIPWIRE_NOTICE = "EMERGENCY LOCKDOWN — A confirmed security tripwire was detected. This browser has been banned, all active player sessions were terminated, and the site is in Level 5 lockdown.";

async function latestEvictionEvent(): Promise<{ at: string; kind: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("activity_log")
    .select("at,kind")
    .in("kind", ["tripwire", "admin_panic", "admin_lockdown"])
    .order("at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Could not check the latest security event");
  return data ?? null;
}

export async function getTripwireBroadcast() {
  const session = await getGateSession();
  const settings = await getSettings();
  const message = settings.broadcast_message ?? TRIPWIRE_NOTICE;
  if (session.data.tripwireNotice && !session.data.tripwireNoticeShown) return message;
  if (session.data.tripwireNoticeShown || !session.data.at) return null;
  const event = await latestEvictionEvent();
  const newerThanSession = !!event && Date.parse(event.at) > session.data.at;
  return newerThanSession && (event.kind === "tripwire" || settings.lockdown_level === 5) ? message : null;
}

export async function takeTripwireNotice() {
  const session = await getGateSession();
  const settings = await getSettings();
  const message = settings.broadcast_message ?? TRIPWIRE_NOTICE;
  if (session.data.tripwireNoticeShown) return null;
  if (session.data.tripwireNotice) {
    await session.update({ ...session.data, tripwireNotice: false, tripwireNoticeShown: true });
    return message;
  }
  if (!session.data.at) return null;
  const event = await latestEvictionEvent();
  if (!event || Date.parse(event.at) <= session.data.at || (event.kind !== "tripwire" && settings.lockdown_level !== 5)) return null;
  await session.update({ ...session.data, tripwireNoticeShown: true });
  return message;
}

export async function enforceChromebook(deviceId?: string) {
  const d = await deviceInfo();
  if (isChromeOSChrome(d.user_agent)) return true;
  const session = await getGateSession();
  if (session.data.tripwireNotice && !session.data.tripwireNoticeShown) return false;

  const settings = await getSettings();
  const latestEvent = settings.lockdown ? await latestEvictionEvent() : null;
  if (latestEvent?.kind === "tripwire" && (!session.data.at || Date.parse(latestEvent.at) > session.data.at)) {
    await session.update({
      ...session.data,
      unlocked: false,
      admin: false,
      deviceId: deviceId ?? session.data.deviceId,
      at: Date.parse(latestEvent.at),
      tripwireNotice: true,
      tripwireNoticeShown: false,
    });
    return false;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let confirmedTripwire = false;
  if (deviceId && DEVICE_ID_PATTERN.test(deviceId) && d.user_agent) {
    const { error } = await supabaseAdmin.rpc("tripwire_emergency", {
      p_device_id: deviceId,
      p_note: `Confirmed tripwire: non-Chromebook player access (${d.device})`,
    });
    if (error) throw new Error("Could not execute tripwire emergency response");
    confirmedTripwire = true;
  } else {
    await logActivity("tripwire_observed", `Non-Chromebook request observed without a verifiable browser ID (${d.device}); no site-wide response was triggered.`, deviceId);
  }
  await session.update({
    ...session.data,
    unlocked: false,
    admin: false,
    deviceId: deviceId ?? session.data.deviceId,
    at: session.data.at ?? Date.now(),
    tripwireNotice: confirmedTripwire,
    tripwireNoticeShown: !confirmedTripwire,
  });
  return false;
}

export async function failedAttempt(kind: "wrong" | "admin_wrong", input: string, deviceId: string) {
  await logActivity(kind, kind === "wrong" ? "Wrong code or password" : "Wrong admin password", deviceId, input);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("record_device_failure", { p_device_id: deviceId });
  if (error) throw new Error("Could not record failed attempt");
  if (data) await logActivity("blocked", "Auto-ban: 3 failed attempts within 5 minutes", deviceId);
}

export async function failedAdminSecondFactor(session: Awaited<ReturnType<typeof getGateSession>>, deviceId: string) {
  const attempts = (session.data.pendingAdminAttempts ?? 0) + 1;
  await logActivity("admin_wrong", "Invalid administrator second factor", deviceId);
  const locked = attempts >= 5;
  await session.update({
    ...session.data,
    pendingAdminAttempts: locked ? undefined : attempts,
    pendingAdminAuth: !locked,
    pendingAdminAt: locked ? undefined : session.data.pendingAdminAt,
    pendingTotpSecret: locked ? undefined : session.data.pendingTotpSecret,
    pendingStaffId: locked ? undefined : session.data.pendingStaffId,
  });
  return locked;
}

export async function startAdminSession(session: Awaited<ReturnType<typeof getGateSession>>, deviceId: string, role: GateSession["adminRole"] = "owner", staffId?: string) {
  const { randomUUID } = await import("node:crypto");
  const token = randomUUID();
  const hash = createHash("sha256").update(token).digest("hex");
  const info = await deviceInfo();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin.from("admin_sessions").insert({
    session_token_hash: hash, role: role ?? "owner", staff_id: staffId ?? null, device_id: deviceId,
    device: info.device, ip: info.ip, expires_at: expiresAt,
  });
  if (error) throw new Error("Could not create admin session");
  await session.update({
    ...session.data, unlocked: true, admin: true, adminSessionToken: token,
    adminRole: role ?? "owner", pendingAdminAuth: false, pendingAdminAt: undefined, pendingAdminAttempts: undefined, pendingTotpSecret: undefined, pendingStaffId: undefined,
    deviceId, at: Date.now(), friendId: undefined, token: undefined,
    tripwireNotice: false, tripwireNoticeShown: true,
  });
  await recordAdminAudit("admin_session_created", "Administrator session created");
}

export async function recordAdminAudit(action: string, detail = "") {
  const session = await getGateSession();
  const token = session.data.adminSessionToken;
  if (!token) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hash = createHash("sha256").update(token).digest("hex");
  const [{ data: row }, info] = await Promise.all([
    supabaseAdmin.from("admin_sessions").select("id,role").eq("session_token_hash", hash).maybeSingle(),
    deviceInfo(),
  ]);
  const { error } = await supabaseAdmin.from("admin_audit_log").insert({
    actor_session_id: row?.id ?? null, actor_role: row?.role ?? "owner",
    action: action.slice(0, 80), detail: detail.slice(0, 1000),
    device: info.device, ip: info.ip,
  });
  if (error) throw new Error("Could not record admin audit event");
}

export async function isAdmin() {
  const s = await getGateSession();
  const token = s.data.adminSessionToken;
  const deviceId = s.data.deviceId;
  if (!s.data.admin || !deviceId || !token) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hash = createHash("sha256").update(token).digest("hex");
  const invalidateSession = async () => {
    await supabaseAdmin.from("admin_sessions").update({ revoked_at: new Date().toISOString() })
      .eq("session_token_hash", hash).is("revoked_at", null);
    await s.update({ ...s.data, unlocked: false, admin: false, adminSessionToken: undefined, adminRole: undefined, friendId: undefined, token: undefined });
  };
  // Owner access is protected by the admin password and TOTP, not the player Chromebook gate.
  // Device bans and the Chromebook tripwire apply to player sessions only.
  const { data, error } = await supabaseAdmin.from("admin_sessions")
    .select("id,role,staff_id,expires_at,revoked_at,last_seen_at")
    .eq("session_token_hash", hash).maybeSingle();
  if (error) throw new Error("Could not validate admin session");
  if (!data || data.revoked_at || Date.parse(data.expires_at) <= Date.now()) {
    if (data && !data.revoked_at) await supabaseAdmin.from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", data.id);
    await s.update({ ...s.data, unlocked: false, admin: false, adminSessionToken: undefined, adminRole: undefined, friendId: undefined, token: undefined });
    return false;
  }
  if (data.staff_id) {
    const { data: staff, error: staffError } = await supabaseAdmin.from("admin_staff").select("disabled").eq("id", data.staff_id).maybeSingle();
    if (staffError) throw new Error("Could not validate staff account");
    if (!staff || staff.disabled) { await invalidateSession(); return false; }
  }
  if (s.data.adminRole !== data.role) await s.update({ ...s.data, adminRole: data.role as GateSession["adminRole"] });
  if (Date.now() - Date.parse(data.last_seen_at) > 60_000) {
    await supabaseAdmin.from("admin_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  }
  return true;
}

/** markSeen: update the friend's "last seen" time (done on hub loads, not every game file). */
export async function isUnlocked(opts: { markSeen?: boolean } = {}) {
  const s = await getGateSession();
  if (!s.data.unlocked) return false;
  if (s.data.admin) return isAdmin();
  if (!(await enforceChromebook(s.data.deviceId))) return false;
  if (!s.data.deviceId) return false;
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

/** Add the time spent in the current game to the friend's totals and clear the live game. */
export async function settlePlaytime(friendId: string, keepGame?: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("friend_passwords")
    .select("current_game, game_started_at, last_seen, play_seconds, total_play_seconds").eq("id", friendId).maybeSingle();
  if (!data) return;
  const secs = data.current_game ? creditSeconds(data.game_started_at, data.last_seen, Date.now()) : 0;
  const patch: { current_game: string | null; game_started_at: string | null; play_seconds?: PlaySecondsJson; total_play_seconds?: number } = {
    current_game: keepGame ?? null,
    game_started_at: keepGame ? new Date().toISOString() : null,
  };
  if (secs > 0 && data.current_game) {
    patch.play_seconds = addPlaytime(data.play_seconds, data.current_game, secs);
    patch.total_play_seconds = data.total_play_seconds + secs;
  }
  await supabaseAdmin.from("friend_passwords").update(patch).eq("id", friendId);
}
type PlaySecondsJson = import("./security-rules").PlaySeconds;

/** Live view: remember which game a signed-in friend is on (null = on the hub). */
export async function setCurrentGame(repo: string | null) {
  const s = await getGateSession();
  if (!s.data.friendId || s.data.admin) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("friend_passwords").select("current_game").eq("id", s.data.friendId).maybeSingle();
  if (data && data.current_game !== repo) await settlePlaytime(s.data.friendId, repo);
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

