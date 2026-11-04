import { createServerFn } from "@tanstack/react-start";

async function requireAdmin() {
  const { getGateSession } = await import("./gate.server");
  if (!(await getGateSession()).data.admin) throw new Error("Not Found");
}

export const kickFriend = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "").trim() }))
  .handler(async ({ data }) => {
    await requireAdmin();
    if (!data.id) throw new Error("Friend id is required.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("friend_passwords")
      .update({ active_session: null })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(`Could not kick friend: ${error.message}`);
    if (!rows?.length) throw new Error("Friend not found.");
    return { ok: true as const };
  });

export const kickEveryone = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const { getSettings } = await import("./gate.server");
  const current = await getSettings();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const kickAllAt = new Date().toISOString();

  const { error: settingsError } = await supabaseAdmin.from("site_settings").upsert({
    id: 1,
    lockdown: current.lockdown,
    hidden_games: current.hidden_games,
    kick_all_at: kickAllAt,
  });
  if (settingsError) throw new Error(`Could not update the kick timestamp: ${settingsError.message}`);

  const { error: friendsError } = await supabaseAdmin
    .from("friend_passwords")
    .update({ active_session: null })
    .not("id", "is", null);
  if (friendsError) throw new Error(`Could not clear friend sessions: ${friendsError.message}`);

  return { ok: true as const };
});
