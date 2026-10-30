import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { adminLogin, createCode, deleteCode, listCodes, lockAdmin } from "@/lib/gate.functions";

export const Route = createFileRoute("/admin")({
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
  loader: () => listCodes(),
  component: Admin,
});

function Admin() {
  const { admin, codes } = Route.useLoaderData();
  const router = useRouter();
  const make = useServerFn(createCode);
  const remove = useServerFn(deleteCode);
  const lock = useServerFn(lockAdmin);

  const [tabOk, setTabOk] = useState<boolean | null>(null);

  useEffect(() => {
    // Admin access only lasts for the tab that entered the passcode.
    const ok = sessionStorage.getItem("admin-tab") === "1";
    setTabOk(ok);
    if (admin && !ok) lock().then(() => router.invalidate());
  }, [admin]);

  if (admin && tabOk === null) return null;
  if (!admin || !tabOk) {
    return <AdminGate />;
  }


  return (
    <div className="mx-auto min-h-screen max-w-md bg-background p-8 text-foreground">
      <h1 className="text-2xl font-bold">One-time codes</h1>
      <p className="mt-1 text-sm text-muted-foreground">Each code works once, then disappears.</p>
      <button
        className="mt-4 rounded bg-primary px-4 py-2 text-primary-foreground"
        onClick={async () => { await make(); await router.invalidate(); }}
      >
        Make a new code
      </button>
      <ul className="mt-6 space-y-2">
        {codes.length === 0 && <li className="text-sm text-muted-foreground">No unused codes.</li>}
        {codes.map((c) => (
          <li key={c} className="flex items-center justify-between rounded border border-border px-3 py-2 font-mono">
            {c}
            <button className="text-sm text-muted-foreground" onClick={async () => { await remove({ data: { code: c } }); await router.invalidate(); }}>
              delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdminGate() {
  const router = useRouter();
  const login = useServerFn(adminLogin);
  const [open, setOpen] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = new FormData(e.currentTarget).get("password") as string;
    const { ok } = await login({ data: { password } });
    if (ok) { sessionStorage.setItem("admin-tab", "1"); await router.invalidate(); }
    else await router.navigate({ to: "/geometry" });
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
    </div>
  );
}

