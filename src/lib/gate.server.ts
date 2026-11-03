import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

// friendId/token are set when a friend signs in with a personal password;
// only the most recent sign-in token for that password stays valid.
type GateSession = { unlocked?: boolean; admin?: boolean; friendId?: string | undefined; token?: string | undefined };

const config = () => ({
  password: process.env["SESSION_SECRET"]!,
  name: "site-gate",
  cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
});

export const getGateSession = () => useSession<GateSession>(config());

export async function isUnlocked() {
  const s = await getGateSession();
  if (!s.data.unlocked) return false;
  if (s.data.admin || !s.data.friendId) return true;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("friend_passwords").select("active_session").eq("id", s.data.friendId).maybeSingle();
  return !!data && data.active_session === s.data.token;
}

export function passwordMatches(input: string, expected: string) {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}
