import { createFileRoute } from "@tanstack/react-router";

// Serves the hub page only to visitors who entered the password.
export const Route = createFileRoute("/hub")({
  server: {
    handlers: {
      GET: async () => {
        const { isUnlocked } = await import("@/lib/gate.server");
        if (!(await isUnlocked())) return new Response("Not Found", { status: 404 });
        const { default: html } = await import("@/server/hub.html?raw");
        return new Response(html, {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      },
    },
  },
});
