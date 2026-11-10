import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const profileSchema = z.object({
  screenWidth: z.number().int().min(0).max(20000),
  screenHeight: z.number().int().min(0).max(20000),
  cpuCores: z.number().int().min(1).max(1024).nullable(),
  deviceMemoryGb: z.number().min(0.25).max(1024).nullable(),
});

async function requireAdmin() {
  const { isAdmin } = await import("./gate.server");
  if (!(await isAdmin())) throw new Error("Not Found");
}

const serviceRpc = async (name: string, args: Record<string, unknown>) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rpc = supabaseAdmin.rpc as unknown as (
    fn: string,
    parameters: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;
  const { error } = await rpc(name, args);
  if (error) throw new Error("Could not save player roster data");
};

// Called after friend sign-in. A browser UUID alone is never authorization:
// both the encrypted session and its current server-side friend token are checked.
export const capturePlayerProfile = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => profileSchema.parse(data))
  .handler(async ({ data }) => {
    const { getGateSession, isUnlocked } = await import("./gate.server");
    const session = await getGateSession();
    if (!session.data.friendId || session.data.admin || !(await isUnlocked())) return { ok: false as const };

    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const ua = getRequestHeader("user-agent") ?? "";
    const chrome = ua.match(/Chrome\/([\d.]+)/)?.[1];
    const chromeOs = ua.match(/CrOS\s+\S+\s+([\d.]+)/)?.[1];
    const browserVersion = [chrome ? `Chrome ${chrome}` : "Browser version unavailable", chromeOs ? `ChromeOS ${chromeOs}` : null]
      .filter(Boolean).join(" / ").slice(0, 100);

    await serviceRpc("capture_player_profile", {
      p_friend_id: session.data.friendId,
      p_screen_size: data.screenWidth && data.screenHeight ? `${data.screenWidth} × ${data.screenHeight}` : null,
      p_cpu_cores: data.cpuCores,
      p_device_memory_gb: data.deviceMemoryGb,
      p_browser_version: browserVersion,
    });
    return { ok: true as const };
  });

export const listPlayerRoster = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("friend_passwords").select("*").order("name");
  if (error) throw new Error("Could not load player roster");
  return { players: (data ?? []) as unknown as PlayerRosterRow[] };
});

export const savePlayerAdminNote = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid(), note: z.string().max(500) }).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin();
    await serviceRpc("save_player_admin_note", { p_friend_id: data.id, p_note: data.note });
    return { ok: true as const };
  });

export type PlayerRosterRow = {
  id: string;
  name: string;
  device_id: string | null;
  device: string | null;
  browser_version: string | null;
  screen_size: string | null;
  cpu_cores: number | null;
  device_memory_gb: number | null;
  playtime_seconds: number;
  game_playtime: Record<string, number> | null;
  current_game: string | null;
  game_started_at: string | null;
  last_seen: string | null;
  admin_note: string;
};
