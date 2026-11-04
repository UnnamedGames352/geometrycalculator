import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { adminLogin, clearActivity, getActivity, saveSettings, updateFriend, createCode, createFriend, deleteCode, deleteFriend, kickFriend, listCodes, listFriends, lockAdmin } from "@/lib/gate.functions";

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
  loader: async () => ({ ...(await listCodes()), ...(await listFriends()), ...(await getActivity()) }),
  component: Admin,
});


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

