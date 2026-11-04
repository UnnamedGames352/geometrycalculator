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

export async function logActivity(kind: string, detail = "") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("activity_log").insert({ kind, detail: detail.slice(0, 80) });
}

/** markSeen: update the friend's "last seen" time (done on hub loads, not every game file). */
export async function isUnlocked(opts: { markSeen?: boolean } = {}) {
  const s = await getGateSession();
  if (!s.data.unlocked) return false;
  if (s.data.admin) return true;
  const settings = await getSettings();
  if (settings.lockdown) return false;
  if (settings.kick_all_at && (s.data.at ?? 0) < new Date(settings.kick_all_at).getTime()) return false;
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
