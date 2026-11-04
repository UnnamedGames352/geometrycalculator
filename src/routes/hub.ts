import { createFileRoute } from "@tanstack/react-router";

// Serves the hub page only to visitors who entered the password.
export const Route = createFileRoute("/hub")({
  server: {
    handlers: {
      GET: async () => {
        const { isUnlocked, getSettings, getGateSession } = await import("@/lib/gate.server");
        if (!(await isUnlocked({ markSeen: true }))) return new Response("Not Found", { status: 404 });
        const { default: raw } = await import("@/server/hub.html?raw");
        // Hide game cards the owner turned off (owner still sees them).
        const hidden = (await getGateSession()).data.admin ? [] : (await getSettings()).hidden_games;
        const css = hidden.map((g) => `.game-card:has(a[href="/play/${g}/"]){display:none}`).join("");
        const html = css ? raw.replace("</head>", `<style>${css}</style></head>`) : raw;
        return new Response(html, {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      },
    },
  },
});
