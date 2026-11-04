import { createFileRoute } from "@tanstack/react-router";

const sessionMonitor = `<script>(()=>{const check=async()=>{try{const response=await fetch('/hub?session-check=1',{cache:'no-store',credentials:'same-origin'});const state=await response.json();if(!state.unlocked)window.top.location.replace('/')}catch{}};void check();setInterval(check,2000)})()</script>`;

// Serves the hub page only to visitors who entered the password.
export const Route = createFileRoute("/hub")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { isUnlocked, getSettings, getGateSession } = await import("@/lib/gate.server");
        const unlocked = await isUnlocked({ markSeen: true });
        const url = new URL(request.url);

        // The hub and game pages poll this endpoint to enforce kicks on already-open tabs.
        if (url.searchParams.get("session-check") === "1") {
          return Response.json({ unlocked }, {
            headers: { "cache-control": "no-store, no-cache, must-revalidate" },
          });
        }
        if (!unlocked) return new Response("Not Found", { status: 404 });

        const { default: raw } = await import("@/server/hub.html?raw");
        // Hide game cards the owner turned off (owner still sees them).
        const hidden = (await getGateSession()).data.admin ? [] : (await getSettings()).hidden_games;
        const css = hidden.map((g) => `.game-card:has(a[href="/play/${g}/"]){display:none}`).join("");
        const html = raw.replace("</head>", `${css ? `<style>${css}</style>` : ""}${sessionMonitor}</head>`);
        return new Response(html, {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      },
    },
  },
});
