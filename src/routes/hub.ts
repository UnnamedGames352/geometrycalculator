import { createFileRoute } from "@tanstack/react-router";

// Serves the hub page only to visitors who entered the password.
export const Route = createFileRoute("/hub")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { isUnlocked, takeMessage, setCurrentGame, guardScript } = await import("@/lib/gate.server");
        const unlocked = await isUnlocked({ markSeen: true });
        const url = new URL(request.url);

        if (url.searchParams.get("session-check") === "1") {
          const message = unlocked ? await takeMessage(url.searchParams.get("ack") === "1") : null;
          return Response.json({ unlocked, message }, {
            headers: { "cache-control": "no-store, no-cache, must-revalidate" },
          });
        }
        if (!unlocked) return Response.redirect(new URL("/geometry", request.url).toString(), 302);

        await setCurrentGame(null);
        const { default: raw } = await import("@/server/hub.html?raw");
        const html = raw.replace("</head>", `${guardScript}</head>`);
        return new Response(html, {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      },
    },
  },
});
