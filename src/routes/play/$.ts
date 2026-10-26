import { createFileRoute } from "@tanstack/react-router";

// Streams game files from the user's GitHub Pages site through this domain,
// so games work even where github.io is blocked.
const ORIGIN = "https://unnamedgames352.github.io/";

export const Route = createFileRoute("/play/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const path = (params as { _splat?: string })._splat ?? "";
        if (path.includes("..")) return new Response("Bad path", { status: 400 });
        const url = new URL(request.url);
        // Directory without trailing slash: redirect so relative files resolve.
        if (path && !path.includes("/") && !url.pathname.endsWith("/")) {
          return Response.redirect(new URL(url.pathname + "/" + url.search, url).toString(), 301);
        }
        const upstream = await fetch(ORIGIN + path + url.search);
        const headers = new Headers();
        for (const h of ["content-type", "content-length", "last-modified", "etag"]) {
          const v = upstream.headers.get(h);
          if (v) headers.set(h, v);
        }
        headers.set("cache-control", "public, max-age=86400");
        return new Response(upstream.body, { status: upstream.status, headers });
      },
    },
  },
});
