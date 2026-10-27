import { createServerFn } from "@tanstack/react-start";

export const checkUnlocked = createServerFn({ method: "GET" }).handler(async () => {
  const { isUnlocked } = await import("./gate.server");
  return { unlocked: await isUnlocked() };
});

export const unlockSite = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => ({ password: String(data?.password ?? "").slice(0, 200) }))
  .handler(async ({ data }) => {
    const { getGateSession, passwordMatches } = await import("./gate.server");
    const expected = process.env["SITE_PASSWORD"];
    if (!expected || !passwordMatches(data.password, expected)) return { ok: false as const };
    const s = await getGateSession();
    await s.update({ unlocked: true });
    return { ok: true as const };
  });
