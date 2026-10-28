import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

type GateSession = { unlocked?: boolean; admin?: boolean };

const config = () => ({
  password: process.env["SESSION_SECRET"]!,
  name: "site-gate",
  cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
});

export const getGateSession = () => useSession<GateSession>(config());

export async function isUnlocked() {
  const s = await getGateSession();
  return !!s.data.unlocked;
}

export function passwordMatches(input: string, expected: string) {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}
