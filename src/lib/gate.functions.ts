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
    if (rows?.length) {
      await s.update({ ...s.data, unlocked: true, friendId: undefined, token: undefined });
      return { ok: true as const };
    }
    // Personal friend password: newest sign-in wins, older device gets kicked out.
    const { data: friend } = await supabaseAdmin.from("friend_passwords").select("id").eq("password", data.code).maybeSingle();
    if (!friend) return { ok: false as const };
    const { randomBytes } = await import("node:crypto");
    const token = randomBytes(16).toString("hex");
    await supabaseAdmin.from("friend_passwords")
      .update({ active_session: token, last_login: new Date().toISOString() }).eq("id", friend.id);
    await s.update({ ...s.data, unlocked: true, friendId: friend.id, token });
    return { ok: true as const };
  });

export const listFriends = createServerFn({ method: "GET" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  if (!(await getGateSession()).data.admin) return { friends: [] as { id: string; name: string; password: string; online: boolean; last_login: string | null }[] };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("friend_passwords").select("*").order("created_at", { ascending: false });
  return { friends: (data ?? []).map((f) => ({ id: f.id, name: f.name, password: f.password, online: !!f.active_session, last_login: f.last_login })) };
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
    if (!expected || !passwordMatches(data.password, expected)) return { ok: false as const };
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
