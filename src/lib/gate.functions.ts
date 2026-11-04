import { createServerFn } from "@tanstack/react-start";

export const checkUnlocked = createServerFn({ method: "GET" }).handler(async () => {
  const { isUnlocked } = await import("./gate.server");
  return { unlocked: await isUnlocked() };
});

// Visitors enter a single-use code; it is deleted the moment it's used.
export const redeemCode = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string }) => ({ code: String(d?.code ?? "").trim().toUpperCase().slice(0, 40) }))
  .handler(async ({ data }) => {
    if (!data.code) return { ok: false as const };
    const { getGateSession } = await import("./gate.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("access_codes").delete().eq("code", data.code).select("code");
    const s = await getGateSession();
    const { logActivity, getSettings } = await import("./gate.server");
    if ((await getSettings()).lockdown) return { ok: false as const };
    if (rows?.length) {
      await s.update({ ...s.data, unlocked: true, friendId: undefined, token: undefined, at: Date.now() });
      await logActivity("code", `One-time code ${data.code} used`);
      return { ok: true as const };
    }
    // Personal friend password: newest sign-in wins, older device gets kicked out.
    const { data: friend } = await supabaseAdmin.from("friend_passwords").select("id, name, paused, expires_at").eq("password", data.code).maybeSingle();
    if (!friend) { await logActivity("wrong", `Wrong password tried: ${data.code}`); return { ok: false as const }; }
    if (friend.paused || (friend.expires_at && new Date(friend.expires_at) < new Date())) {
      await logActivity("blocked", `${friend.name} tried to sign in (paused or expired)`);
      return { ok: false as const };
    }
    const { randomBytes } = await import("node:crypto");
    const token = randomBytes(16).toString("hex");
    await supabaseAdmin.from("friend_passwords")
      .update({ active_session: token, last_login: new Date().toISOString() }).eq("id", friend.id);
    await s.update({ ...s.data, unlocked: true, friendId: friend.id, token, at: Date.now() });
    await logActivity("login", `${friend.name} signed in`);
    return { ok: true as const };
  });

type Friend = { id: string; name: string; password: string; online: boolean; last_login: string | null; last_seen: string | null; paused: boolean; expires_at: string | null };

export const listFriends = createServerFn({ method: "GET" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  if (!(await getGateSession()).data.admin) return { friends: [] as Friend[] };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("friend_passwords").select("*").order("created_at", { ascending: false });
  return { friends: (data ?? []).map((f): Friend => ({ id: f.id, name: f.name, password: f.password, online: !!f.active_session, last_login: f.last_login, last_seen: f.last_seen, paused: f.paused, expires_at: f.expires_at })) };
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
export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string }) => ({ password: String(d?.password ?? "").slice(0, 200) }))
  .handler(async ({ data }) => {
    const { getGateSession, passwordMatches } = await import("./gate.server");
    const expected = process.env["SITE_PASSWORD"];
    if (!expected || !passwordMatches(data.password, expected)) {
      const { logActivity } = await import("./gate.server");
      await logActivity("wrong", "Wrong admin passcode tried");
      return { ok: false as const };
    }
    const s = await getGateSession();
    await s.update({ unlocked: true, admin: true });
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
  if (!s.data.admin) throw new Error("Not Found");
}

export const listCodes = createServerFn({ method: "GET" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  if (!(await getGateSession()).data.admin) return { admin: false as const, codes: [] as string[] };
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
  if (!(await getGateSession()).data.admin) return { log: [], settings: { lockdown: false, hidden_games: [] as string[], kick_all_at: null as string | null } };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("activity_log").select("at, kind, detail").order("at", { ascending: false }).limit(50);
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
      kick_all_at: data.kickAll ? new Date().toISOString() : cur.kick_all_at,
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("site_settings").upsert(next);
    if (data.kickAll) await supabaseAdmin.from("friend_passwords").update({ active_session: null }).not("id", "is", null);
    return { ok: true };
  });
