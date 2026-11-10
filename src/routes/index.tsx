import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { checkUnlocked, lockGate, redeemCode } from "@/lib/gate.functions";
import { getBrowserDeviceId, getHardwareSnapshot } from "@/lib/security-rules";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "404 Not Found" },
    { name: "description", content: "The requested page could not be found." },
    { property: "og:title", content: "404 Not Found" },
    { property: "og:description", content: "The requested page could not be found." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  loader: async () => {
    const state = await checkUnlocked();
    if (state.lockdown) throw redirect({ to: "/geometry" });
    return state;
  },
  component: Index,
});

function Index() {
  const { unlocked } = Route.useLoaderData();
  const router = useRouter();
  const lock = useServerFn(lockGate);
  const [tabOk, setTabOk] = useState<boolean | null>(null);
  useEffect(() => {
    const ok = sessionStorage.getItem("gate-tab") === "1";
    setTabOk(ok);
    if (unlocked && !ok) lock().then(() => router.invalidate());
  }, [unlocked]);
  const check = useServerFn(checkUnlocked);
  useEffect(() => {
    if (!unlocked || !tabOk) return;
    const id = setInterval(async () => {
      try { if (!(await check()).unlocked) window.location.replace("/geometry"); } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(id);
  }, [unlocked, tabOk]);
  useEffect(() => {
    if (!unlocked || !tabOk) return;
    document.title = "Untitled document - Google Docs";
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.href = "https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico";
  }, [unlocked, tabOk]);
  if (unlocked && tabOk === null) return null;
  if (unlocked && tabOk) return <iframe src="/hub" title="UnnamedGamesHub" className="fixed inset-0 h-full w-full border-0" />;
  return <FakeError />;
}

function FakeError() {
  const router = useRouter();
  const unlock = useServerFn(redeemCode);
  const [open, setOpen] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  useEffect(() => { setDeviceId(getBrowserDeviceId()); }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = new FormData(e.currentTarget).get("code") as string;
    const { ok } = await unlock({ data: { code, deviceId, hardware: getHardwareSnapshot() } });
    if (ok) {
      sessionStorage.setItem("gate-tab", "1");
      sessionStorage.setItem("last-active", String(Date.now()));
      await router.invalidate();
    } else await router.navigate({ to: "/geometry" });
  }

  return <div className="min-h-screen bg-background p-8 font-serif text-foreground">
    <h1 className="text-center text-3xl font-bold">404 Not Found</h1>
    <hr className="my-4 border-border" />
    <p className="text-center">nginx/1.24.0
      <Button variant="ghost" type="button" aria-label="." onClick={() => setOpen((o) => !o)} className="h-auto rounded-none p-0 font-serif text-base cursor-default hover:bg-transparent">.</Button>
    </p>
    {open && <form onSubmit={onSubmit} className="mx-auto mt-10 flex max-w-xs gap-2">
      <input name="code" type="text" maxLength={200} autoFocus autoComplete="off" className="min-w-0 flex-1 border border-border bg-background px-2 py-1 text-sm" />
      <Button variant="outline" disabled={!deviceId} type="submit" aria-label="Submit code" className="border border-border px-3 text-sm">→</Button>
    </form>}
  </div>;
}
