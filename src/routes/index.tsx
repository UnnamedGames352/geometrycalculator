import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { checkUnlocked, unlockSite } from "@/lib/gate.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "404 Not Found" },
      { name: "description", content: "The requested page could not be found." },
      { property: "og:title", content: "404 Not Found" },
      { property: "og:description", content: "The requested page could not be found." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: () => checkUnlocked(),
  component: Index,
});

function Index() {
  const { unlocked } = Route.useLoaderData();
  if (unlocked) {
    return <iframe src="/hub" title="UnnamedGamesHub" className="fixed inset-0 h-full w-full border-0" />;
  }
  return <FakeError />;
}

function FakeError() {
  const router = useRouter();
  const unlock = useServerFn(unlockSite);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = new FormData(e.currentTarget).get("password") as string;
    const { ok } = await unlock({ data: { password } });
    if (ok) await router.invalidate();
    else setError(true);
  }

  return (
    <div className="min-h-screen bg-background p-8 font-serif text-foreground">
      <h1 className="text-center text-3xl font-bold">404 Not Found</h1>
      <hr className="my-4 border-border" />
      <p className="text-center">
        nginx/1.24.0
        {/* Secret button: the period is clickable */}
        <button type="button" aria-label="." onClick={() => setOpen((o) => !o)} className="cursor-default">.</button>
      </p>
      {open && (
        <form onSubmit={onSubmit} className="mx-auto mt-10 flex max-w-xs gap-2">
          <input name="password" type="password" autoFocus autoComplete="off"
            className="flex-1 border border-border bg-background px-2 py-1 text-sm" />
          <button type="submit" className="border border-border px-3 text-sm">→</button>
        </form>
      )}
      {open && error && <p className="mt-2 text-center text-sm text-muted-foreground">nope</p>}
    </div>
  );
}
