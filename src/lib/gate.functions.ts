import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DEVICE_ID_PATTERN, addPlaytime, parseBrowserVersion, parseHardware } from "./security-rules";
const deviceIdSchema = z.string().regex(DEVICE_ID_PATTERN);

export const checkUnlocked = createServerFn({ method: "GET" }).handler(async () => {
  const { isUnlocked, getSettings } = await import("./gate.server");
  return { unlocked: await isUnlocked(), lockdown: (await getSettings()).lockdown };
});

// Visitors enter a single-use code; it is deleted the moment it's used.
export const redeemCode = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string; deviceId: string; hardware?: unknown }) => ({ ...z.object({ code: z.string().max(200), deviceId: deviceIdSchema }).parse(d), hardware: parseHardware(d.hardware) }))
  .handler(async ({ data }) => {
    const { getGateSession, enforceChromebook, isDeviceBanned, logActivity, getSettings, failedAttempt, deviceInfo, settlePlaytime } = await import("./gate.server");
    if (!(await enforceChromebook(data.deviceId))) { await logActivity("blocked", "Non-Chromebook unlock rejected", data.deviceId, data.code); return { ok: false as const }; }
    if ((await getSettings()).lockdown) { await logActivity("blocked", "Lockdown active: rejected input", data.deviceId, data.code); return { ok: false as const }; }
    if (await isDeviceBanned(data.deviceId)) { await logActivity("blocked", "Banned device attempted code", data.deviceId, data.code); return { ok: false as const }; }
    const code = data.code.trim().toUpperCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const s = await getGateSession();
    const { data: rows, error } = await supabaseAdmin.from("access_codes").delete().eq("code", code).select("code");
    if (error) throw new Error("Could not validate code");
    if (rows?.length) {
      await s.update({ unlocked: true, admin: false, deviceId: data.deviceId, friendId: undefined, token: undefined, at: Date.now() });
      await logActivity("code", `One-time code ${code} used`, data.deviceId, data.code);
      return { ok: true as const };
    }
    const { data: friend, error: friendError } = await supabaseAdmin.from("friend_passwords").select("id,name,paused,expires_at").eq("password",code).maybeSingle();
    if (friendError) throw new Error("Could not validate password");
    if (!friend) { await failedAttempt("wrong",data.code,data.deviceId); return { ok: false as const }; }
    if (friend.paused || (friend.expires_at && Date.parse(friend.expires_at) <= Date.now())) {
      await logActivity("blocked", `${friend.name}: password paused or expired`,data.deviceId,data.code); return { ok: false as const };
    }
    const token = crypto.randomUUID();
    await settlePlaytime(friend.id);
    const info = await deviceInfo();
    const { error: updateError } = await supabaseAdmin.from("friend_passwords").update({ active_session: token, device_id: data.deviceId, last_login: new Date().toISOString(), last_seen: new Date().toISOString(), ...info, browser_version: parseBrowserVersion(info.user_agent), screen: data.hardware.screen, cpu_cores: data.hardware.cores, memory_gb: data.hardware.memory }).eq("id",friend.id);
    if (updateError) throw new Error("Could not start friend session");
    await s.update({ unlocked: true, admin: false, deviceId: data.deviceId, friendId: friend.id, token, at: Date.now() });
    await logActivity("login", `${friend.name} signed in`,data.deviceId,data.code);
    return { ok: true as const };
  });

type Friend = { device_id: string | null; id: string; name: string; password: string; online: boolean; last_login: string | null; last_seen: string | null; paused: boolean; expires_at: string | null; device: string | null; ip: string | null; location: string | null; user_agent: string | null; current_game: string | null; game_started_at: string | null; message: string | null; browser_version: string | null; screen: string | null; cpu_cores: number | null; memory_gb: number | null; total_play_seconds: number; play_seconds: Record<string, number>; admin_note: string };

export const listFriends = createServerFn({ method: "GET" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  if (!(await (await import("./gate.server")).isAdmin())) return { friends: [] as Friend[] };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("friend_passwords").select("*").order("created_at", { ascending: false });
  return { friends: (data ?? []).map((f): Friend => ({ device_id: f.device_id, id: f.id, name: f.name, password: f.password, online: !!f.active_session, last_login: f.last_login, last_seen: f.last_seen, paused: f.paused, expires_at: f.expires_at, device: f.device, ip: f.ip, location: f.location, user_agent: f.user_agent, current_game: f.current_game, game_started_at: f.game_started_at, message: f.message, browser_version: f.browser_version, screen: f.screen, cpu_cores: f.cpu_cores, memory_gb: f.memory_gb, total_play_seconds: f.total_play_seconds, play_seconds: addPlaytime(f.play_seconds, null, 0), admin_note: f.admin_note })) };
});

export const createFriend = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string }) => ({ name: String(d?.name ?? "").trim().slice(0, 40) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { randomBytes } = await import("node:crypto");
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const password = Array.from(randomBytes(10), (b) => abc[b % abc.length]).join("");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("friend_passwords").insert({ name: data.name, password });
    return { password };
  });

export const deleteFriend = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("friend_passwords").delete().eq("id", data.id);
    return { ok: true };
  });

export const kickFriend = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("friend_passwords").update({ active_session: null }).eq("id", data.id);
    return { ok: true };
  });

// Owner signs in to the secret admin page with SITE_PASSWORD.
export const checkAdminSession = createServerFn({ method: "GET" }).handler(async () => {
  const { isAdmin } = await import("./gate.server");
  return { admin: await isAdmin() };
});

export const checkAdminAccessServer = createServerFn({ method: "GET" }).handler(async () => {
  const { enforceChromebook, getGateSession } = await import("./gate.server");
  return { allowed: await enforceChromebook((await getGateSession()).data.deviceId) };
});

export const checkAdminAccess = createServerFn({ method: "POST" })
  .inputValidator((d: { deviceId: string }) => z.object({ deviceId: deviceIdSchema }).parse(d))
  .handler(async ({ data }) => {
    const { enforceChromebook, isDeviceBanned } = await import("./gate.server");
    return { allowed: await enforceChromebook(data.deviceId) && !(await isDeviceBanned(data.deviceId)) };
  });

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; deviceId: string }) => z.object({ password: z.string().max(200), deviceId: deviceIdSchema }).parse(d))
  .handler(async ({ data }) => {
    const { getGateSession, passwordMatches, enforceChromebook, isDeviceBanned, failedAttempt, logActivity } = await import("./gate.server");
    if (!(await enforceChromebook(data.deviceId))) { await logActivity("blocked", "Non-Chromebook admin login rejected",data.deviceId,data.password); return { ok: false as const }; }
    if (await isDeviceBanned(data.deviceId)) { await logActivity("blocked", "Banned device attempted admin login",data.deviceId,data.password); return { ok: false as const }; }
    const expected = process.env["SITE_PASSWORD"];
    if (!expected || !passwordMatches(data.password,expected)) { await failedAttempt("admin_wrong",data.password,data.deviceId); return { ok: false as const }; }
    const session = await getGateSession();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: security, error } = await supabaseAdmin.from("admin_security").select("totp_enabled").eq("id", 1).maybeSingle();
    if (error) throw new Error("Could not check administrator security settings");
    await session.update({ ...session.data, admin: false, adminSessionToken: undefined, adminRole: undefined, pendingAdminAuth: true, pendingTotpSecret: undefined, deviceId: data.deviceId, at: Date.now() });
    await logActivity("admin_password_verified", "Admin password verified; second factor required", data.deviceId);
    return security?.totp_enabled ? { ok: false as const, requiresTwoFactor: true as const } : { ok: false as const, requiresSetup: true as const };
  });

export const beginAdminTwoFactorSetup = createServerFn({ method: "POST" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  const session = await getGateSession();
  if (!session.data.pendingAdminAuth || !session.data.deviceId) throw new Error("Verify the admin password first.");
  const { generateTotpSecret, buildTotpUri } = await import("./admin-security");
  const secret = generateTotpSecret();
  await session.update({ ...session.data, pendingTotpSecret: secret });
  return { secret, uri: buildTotpUri(secret) };
});

export const confirmAdminTwoFactorSetup = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string }) => z.object({ code: z.string().regex(/^\\d{6}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { getGateSession, startAdminSession, recordAdminAudit } = await import("./gate.server");
    const session = await getGateSession();
    const secret = session.data.pendingTotpSecret;
    if (!session.data.pendingAdminAuth || !session.data.deviceId || !secret) throw new Error("Start authenticator setup first.");
    const { verifyTotp, encryptTotpSecret, generateRecoveryCodes, hashRecoveryCode } = await import("./admin-security");
    if (!verifyTotp(secret, data.code)) return { ok: false as const, error: "That authenticator code is not valid." };
    const sessionSecret = process.env["SESSION_SECRET"];
    if (!sessionSecret) throw new Error("Session encryption is unavailable.");
    const recoveryCodes = generateRecoveryCodes();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("admin_security").upsert({
      id: 1, totp_secret_ciphertext: encryptTotpSecret(secret, sessionSecret),
      totp_enabled: true, recovery_code_hashes: recoveryCodes.map(hashRecoveryCode), updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Could not save authenticator settings");
    await startAdminSession(session, session.data.deviceId);
    await recordAdminAudit("two_factor_enabled", "Authenticator-based two-factor authentication enabled");
    return { ok: true as const, recoveryCodes };
  });

export const verifyAdminTwoFactor = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string }) => z.object({ code: z.string().min(6).max(32) }).parse(d))
  .handler(async ({ data }) => {
    const { getGateSession, startAdminSession, recordAdminAudit } = await import("./gate.server");
    const session = await getGateSession();
    if (!session.data.pendingAdminAuth || !session.data.deviceId) return { ok: false as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: security, error } = await supabaseAdmin.from("admin_security").select("*").eq("id", 1).maybeSingle();
    if (error || !security?.totp_enabled || !security.totp_secret_ciphertext) return { ok: false as const };
    const sessionSecret = process.env["SESSION_SECRET"];
    if (!sessionSecret) throw new Error("Session encryption is unavailable.");
    const { decryptTotpSecret, verifyTotp, hashRecoveryCode } = await import("./admin-security");
    let accepted = false;
    let recoveryHashes = security.recovery_code_hashes ?? [];
    try { accepted = verifyTotp(decryptTotpSecret(security.totp_secret_ciphertext, sessionSecret), data.code); } catch { accepted = false; }
    if (!accepted) {
      const candidate = hashRecoveryCode(data.code);
      const index = recoveryHashes.indexOf(candidate);
      if (index >= 0) { recoveryHashes = recoveryHashes.filter((_, i) => i !== index); accepted = true; }
    }
    if (!accepted) return { ok: false as const };
    if (recoveryHashes.length !== (security.recovery_code_hashes ?? []).length) {
      const { error: updateError } = await supabaseAdmin.from("admin_security").update({ recovery_code_hashes: recoveryHashes, updated_at: new Date().toISOString() }).eq("id", 1);
      if (updateError) throw new Error("Could not consume recovery code");
    }
    await startAdminSession(session, session.data.deviceId);
    await recordAdminAudit("admin_two_factor_login", "Administrator completed two-factor authentication");
    return { ok: true as const };
  });

export const getAdminSecurityOverview = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { getGateSession } = await import("./gate.server");
  const session = await getGateSession();
  const { createHash } = await import("node:crypto");
  const hash = session.data.adminSessionToken ? createHash("sha256").update(session.data.adminSessionToken).digest("hex") : "";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: settings, error: settingsError }, { data: sessions, error: sessionsError }, { data: audit, error: auditError }] = await Promise.all([
    supabaseAdmin.from("admin_security").select("totp_enabled,recovery_code_hashes").eq("id", 1).maybeSingle(),
    supabaseAdmin.from("admin_sessions").select("id,role,device,ip,created_at,last_seen_at,expires_at,revoked_at,session_token_hash").is("revoked_at", null).order("last_seen_at", { ascending: false }).limit(30),
    supabaseAdmin.from("admin_audit_log").select("id,actor_role,action,detail,device,ip,created_at").order("created_at", { ascending: false }).limit(40),
  ]);
  if (settingsError || sessionsError || auditError) throw new Error("Could not load admin security overview");
  return {
    twoFactorEnabled: !!settings?.totp_enabled,
    remainingRecoveryCodes: settings?.recovery_code_hashes?.length ?? 0,
    sessions: (sessions ?? []).map(({ session_token_hash, ...row }) => ({ ...row, current: session_token_hash === hash })),
    audit: audit ?? [],
  };
});

export const revokeAdminSession = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { getGateSession, recordAdminAudit } = await import("./gate.server");
    const session = await getGateSession();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", data.id).is("revoked_at", null).select("id").maybeSingle();
    if (error) throw new Error("Could not revoke admin session");
    if (!row) return { ok: false as const };
    await recordAdminAudit("admin_session_revoked", `Administrator session ${data.id} revoked`);
    const { createHash } = await import("node:crypto");
    if (session.data.adminSessionToken) {
      const hash = createHash("sha256").update(session.data.adminSessionToken).digest("hex");
      const { data: current } = await supabaseAdmin.from("admin_sessions").select("id").eq("id", data.id).eq("session_token_hash", hash).maybeSingle();
      if (current) await session.update({ ...session.data, admin: false, adminSessionToken: undefined, adminRole: undefined });
    }
    return { ok: true as const };
  });

// Locks the admin page again (used when a new tab opens without having entered the passcode).
export const lockAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const { getGateSession, recordAdminAudit } = await import("./gate.server");
  const s = await getGateSession();
  if (s.data.adminSessionToken) {
    const { createHash } = await import("node:crypto");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hash = createHash("sha256").update(s.data.adminSessionToken).digest("hex");
    await supabaseAdmin.from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("session_token_hash", hash).is("revoked_at", null);
    await recordAdminAudit("admin_logout", "Administrator signed out");
  }
  await s.update({ ...s.data, admin: false, adminSessionToken: undefined, adminRole: undefined, pendingAdminAuth: false, pendingTotpSecret: undefined });
  return { ok: true };
});


async function requireAdmin() {
  if (!(await (await import("./gate.server")).isAdmin())) throw new Error("Not Found");
}

export const listCodes = createServerFn({ method: "GET" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  if (!(await (await import("./gate.server")).isAdmin())) return { admin: false as const, codes: [] as string[] };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("access_codes").select("code").order("created_at", { ascending: false });
  return { admin: true as const, codes: (data ?? []).map((r) => r.code) };
});

export const createCode = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const { randomBytes } = await import("node:crypto");
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = Array.from(randomBytes(8), (b) => abc[b % abc.length]).join("");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("access_codes").insert({ code });
  return { code };
});

export const deleteCode = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string }) => ({ code: String(d?.code ?? "") }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("access_codes").delete().eq("code", data.code);
    return { ok: true };
  });

// Locks this browser again (used when a new tab opens without having entered a code).
export const lockGate = createServerFn({ method: "POST" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  const s = await getGateSession();
  await s.update({ ...s.data, unlocked: false });
  return { ok: true };
});

const randomPassword = async () => {
  const { randomBytes } = await import("node:crypto");
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(10), (b) => abc[b % abc.length]).join("");
};

// Edit a friend: rename, set/random new password (kicks them out), pause, expiry.
export const updateFriend = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; name?: string; password?: string; newRandom?: boolean; paused?: boolean; expires_at?: string | null; admin_note?: string }) => ({
    id: String(d?.id ?? ""),
    admin_note: d?.admin_note === undefined ? undefined : String(d.admin_note).trim().slice(0, 300),
    name: d?.name === undefined ? undefined : String(d.name).trim().slice(0, 40),
    password: d?.password === undefined ? undefined : String(d.password).trim().toUpperCase().slice(0, 40),
    newRandom: !!d?.newRandom,
    paused: d?.paused === undefined ? undefined : !!d.paused,
    expires_at: d?.expires_at === undefined ? undefined : d.expires_at ? new Date(d.expires_at).toISOString() : null,
  }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const patch: { name?: string; password?: string; active_session?: null; paused?: boolean; expires_at?: string | null; admin_note?: string } = {};
    if (data.admin_note !== undefined) patch.admin_note = data.admin_note;
    if (data.name !== undefined) patch.name = data.name;
    const pw = data.newRandom ? await randomPassword() : data.password;
    if (pw !== undefined) {
      if (pw.length < 4) return { ok: false as const, error: "Password must be at least 4 characters." };
      patch.password = pw; patch.active_session = null;
    }
    if (data.paused !== undefined) { patch.paused = data.paused; if (data.paused) patch.active_session = null; }
    if (data.expires_at !== undefined) patch.expires_at = data.expires_at;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("friend_passwords").update(patch).eq("id", data.id);
    if (error) return { ok: false as const, error: error.code === "23505" ? "That password is already used." : "Could not save." };
    return { ok: true as const };
  });

export const getActivity = createServerFn({ method: "GET" }).handler(async () => {
  const { getGateSession, getSettings } = await import("./gate.server");
  if (!(await (await import("./gate.server")).isAdmin())) return { log: [], settings: { lockdown: false, hidden_games: [] as string[], kick_all_at: null as string | null } };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("activity_log").select("at, kind, detail, device_id, device, attempted_input").order("at", { ascending: false }).limit(50);
  return { log: data ?? [], settings: await getSettings() };
});

export const clearActivity = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("activity_log").delete().not("id", "is", null);
  return { ok: true };
});

export const saveSettings = createServerFn({ method: "POST" })
  .inputValidator((d: { lockdown?: boolean; hidden_games?: string[]; kickAll?: boolean }) => ({
    lockdown: d?.lockdown === undefined ? undefined : !!d.lockdown,
    hidden_games: Array.isArray(d?.hidden_games) ? d.hidden_games.map(String).filter((g) => /^[\w.-]+$/.test(g)).slice(0, 50) : undefined,
    kickAll: !!d?.kickAll,
  }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { getSettings } = await import("./gate.server");
    const cur = await getSettings();
    const next = {
      id: 1,
      lockdown: data.lockdown ?? cur.lockdown,
      hidden_games: data.hidden_games ?? cur.hidden_games,
      kick_all_at: data.kickAll || data.lockdown === true ? new Date().toISOString() : cur.kick_all_at,
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("site_settings").upsert(next);
    if (error) throw new Error("Could not save settings");
    if (data.kickAll || data.lockdown === true) await (await import("./gate.server")).evictUsers(data.lockdown);
    if (data.lockdown === true && !cur.lockdown) await (await import("./gate.server")).logActivity("admin_lockdown", "Admin enabled site lockdown");
    if (data.kickAll) await (await import("./gate.server")).logActivity("admin_panic", "Admin cleared all player sessions");
    return { ok: true };
  });

export const messageFriend = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; message: string }) => ({ id: String(d?.id ?? "").trim(), message: String(d?.message ?? "").trim().slice(0, 300) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    if (!data.id) throw new Error("Friend id is required.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("friend_passwords").update({ message: data.message || null }).eq("id", data.id);
    if (error) throw new Error("Could not send the message.");
    return { ok: true as const };
  });

export const messageOnlineFriend = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; message: string }) => ({
    id: String(d?.id ?? "").trim(),
    message: String(d?.message ?? "").trim().slice(0, 300),
  }))
  .handler(async ({ data }) => {
    await requireAdmin();
    if (!data.id || !data.message) throw new Error("A player and message are required.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const cutoff = new Date(Date.now() - 120_000).toISOString();
    const { data: rows, error } = await supabaseAdmin.from("friend_passwords")
      .update({ message: data.message }).eq("id", data.id)
      .not("active_session", "is", null).eq("paused", false)
      .or(`expires_at.is.null,expires_at.gt.${now}`).gt("last_seen", cutoff).select("id");
    if (error) throw new Error("Could not send the message.");
    if (!rows?.length) return { ok: false as const, error: "That player is no longer online." };
    return { ok: true as const, sent: 1 };
  });

export const messageOnlineFriends = createServerFn({ method: "POST" })
  .inputValidator((d: { message: string }) => ({ message: String(d?.message ?? "").trim().slice(0, 300) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    if (!data.message) throw new Error("Enter a message before sending.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const cutoff = new Date(Date.now() - 120_000).toISOString();
    const { data: rows, error } = await supabaseAdmin.from("friend_passwords")
      .update({ message: data.message })
      .not("active_session", "is", null).eq("paused", false)
      .or(`expires_at.is.null,expires_at.gt.${now}`).gt("last_seen", cutoff).select("id");
    if (error) throw new Error("Could not broadcast to online players.");
    return { ok: true as const, sent: rows?.length ?? 0 };
  });

export const messageAllFriends = createServerFn({ method: "POST" })
  .inputValidator((d: { message: string }) => ({ message: String(d?.message ?? "").trim().slice(0, 300) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    if (!data.message) throw new Error("Enter a message before sending.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.from("friend_passwords")
      .update({ message: data.message })
      .not("id", "is", null).select("id");
    if (error) throw new Error("Could not broadcast to friend accounts.");
    return { ok: true as const, sent: rows?.length ?? 0 };
  });

export const getGeometryTripwireNotice = createServerFn({ method: "GET" }).handler(async () => {
  const { takeTripwireNotice } = await import("./gate.server");
  return { message: await takeTripwireNotice() };
});

export const listBans = createServerFn({ method: "GET" }).handler(async () => {
  if (!(await (await import("./gate.server")).isAdmin())) return { bans: [] as { device_id: string; note: string; created_at: string }[] };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("banned_devices").select("device_id,note,created_at").order("created_at",{ascending:false});
  if (error) throw new Error("Could not list browser bans");
  return { bans: data ?? [] };
});
export const setBan = createServerFn({ method: "POST" })
  .inputValidator((d: { deviceId: string; note?: string; banned: boolean }) => z.object({ deviceId: deviceIdSchema, note: z.string().max(200).optional(), banned: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = data.banned ? await supabaseAdmin.from("banned_devices").upsert({device_id:data.deviceId,note:data.note ?? ""}) : await supabaseAdmin.from("banned_devices").delete().eq("device_id",data.deviceId);
    if (result.error) throw new Error("Could not update browser ban");
    if (!data.banned) await supabaseAdmin.from("device_failures").delete().eq("device_id",data.deviceId);
    await (await import("./gate.server")).logActivity("ban",data.banned ? "Browser banned" : "Browser unbanned",data.deviceId);
    return { ok: true };
  });
export const globalPanic = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const { evictUsers, logActivity } = await import("./gate.server");
  await evictUsers();
  await logActivity("admin_panic","Global Panic: kicked all players to geometry");
  return { ok: true as const };
});
