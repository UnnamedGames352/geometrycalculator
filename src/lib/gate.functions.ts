import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DEVICE_ID_PATTERN } from "./security-rules";
const deviceIdSchema = z.string().regex(DEVICE_ID_PATTERN);

export const checkUnlocked = createServerFn({ method: "GET" }).handler(async () => {
  const { isUnlocked, getSettings } = await import("./gate.server");
  return { unlocked: await isUnlocked(), lockdown: (await getSettings()).lockdown };
});

// Visitors enter a single-use code; it is deleted the moment it's used.
export const redeemCode = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string; deviceId: string }) => z.object({ code: z.string().max(200), deviceId: deviceIdSchema }).parse(d))
  .handler(async ({ data }) => {
    const { getGateSession, enforceChromebook, isDeviceBanned, logActivity, getSettings, failedAttempt, deviceInfo } = await import("./gate.server");
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
    const { error: updateError } = await supabaseAdmin.from("friend_passwords").update({ active_session: token, device_id: data.deviceId, last_login: new Date().toISOString(), last_seen: new Date().toISOString(), ...(await deviceInfo()) }).eq("id",friend.id);
    if (updateError) throw new Error("Could not start friend session");
    await s.update({ unlocked: true, admin: false, deviceId: data.deviceId, friendId: friend.id, token, at: Date.now() });
    await logActivity("login", `${friend.name} signed in`,data.deviceId,data.code);
    return { ok: true as const };
  });

type Friend = { device_id: string | null; id: string; name: string; password: string; online: boolean; last_login: string | null; last_seen: string | null; paused: boolean; expires_at: string | null; device: string | null; ip: string | null; location: string | null; user_agent: string | null; current_game: string | null; game_started_at: string | null; message: string | null };

export const listFriends = createServerFn({ method: "GET" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  if (!(await (await import("./gate.server")).isAdmin())) return { friends: [] as Friend[] };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("friend_passwords").select("*").order("created_at", { ascending: false });
  return { friends: (data ?? []).map((f): Friend => ({ device_id: f.device_id, id: f.id, name: f.name, password: f.password, online: !!f.active_session, last_login: f.last_login, last_seen: f.last_seen, paused: f.paused, expires_at: f.expires_at, device: f.device, ip: f.ip, location: f.location, user_agent: f.user_agent, current_game: f.current_game, game_started_at: f.game_started_at, message: f.message })) };
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
    const s = await getGateSession();
    await s.update({ unlocked: true, admin: true, deviceId: data.deviceId, at: Date.now(), friendId: undefined, token: undefined });
    await logActivity("admin_login", "Admin signed in",data.deviceId);
    return { ok: true as const };
  });

// Locks the admin page again (used when a new tab opens without having entered the passcode).
export const lockAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  const s = await getGateSession();
  await s.update({ ...s.data, admin: false });
  return { ok: true };
});


async function requireAdmin() {
  const { getGateSession } = await import("./gate.server");
  const s = await getGateSession();
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
  .inputValidator((d: { id: string; name?: string; password?: string; newRandom?: boolean; paused?: boolean; expires_at?: string | null }) => ({
    id: String(d?.id ?? ""),
    name: d?.name === undefined ? undefined : String(d.name).trim().slice(0, 40),
    password: d?.password === undefined ? undefined : String(d.password).trim().toUpperCase().slice(0, 40),
    newRandom: !!d?.newRandom,
    paused: d?.paused === undefined ? undefined : !!d.paused,
    expires_at: d?.expires_at === undefined ? undefined : d.expires_at ? new Date(d.expires_at).toISOString() : null,
  }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const patch: { name?: string; password?: string; active_session?: null; paused?: boolean; expires_at?: string | null } = {};
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
    return { ok: true };
  });

export const messageFriend = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; message: string }) => ({ id: String(d?.id ?? ""), message: String(d?.message ?? "").trim().slice(0, 300) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("friend_passwords").update({ message: data.message || null }).eq("id", data.id);
    return { ok: true };
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
