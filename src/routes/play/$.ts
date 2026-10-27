import { createFileRoute } from "@tanstack/react-router";

// Streams game files straight from the user's GitHub repos (default branch)
// through this domain, so games work even where github.io is blocked.
const OWNER = "UnnamedGames352";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", json: "application/json", wasm: "application/wasm",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  svg: "image/svg+xml", webp: "image/webp", ico: "image/x-icon",
  mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4",
  mp4: "video/mp4", webm: "video/webm", ttf: "font/ttf", woff: "font/woff",
  woff2: "font/woff2", otf: "font/otf", xml: "application/xml", txt: "text/plain",
};

export const Route = createFileRoute("/play/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const splat = (params as { _splat?: string })._splat ?? "";
        if (splat.includes("..") || !splat) return new Response("Bad path", { status: 400 });
        const url = new URL(request.url);
        const [repo, ...rest] = splat.split("/");
        if (!/^[\w.-]+$/.test(repo)) return new Response("Bad repo", { status: 400 });
        // Repo root without trailing slash: redirect so relative files resolve.
        if (rest.length === 0 && !url.pathname.endsWith("/")) {
          return Response.redirect(new URL(url.pathname + "/" + url.search, url).toString(), 301);
        }
        let file = rest.join("/");
        if (file === "" || file.endsWith("/")) file += "index.html";
        const raw = (f: string) =>
          `https://raw.githubusercontent.com/${OWNER}/${repo}/HEAD/${f.split("/").map(encodeURIComponent).join("/")}`;
        let upstream = await fetch(raw(file));
        // Some games reference "_2_" texture variants that don't exist in the
        // repo; fall back to the base texture (e.g. groundSquare_01_2_001 -> _001).
        if (upstream.status === 404 && /_\d+_(?=\d+\.[^.]+$)/.test(file)) {
          const alt = file.replace(/_\d+_(?=\d+\.[^.]+$)/, "_");
          if (alt !== file) upstream = await fetch(raw(alt));
        }
        if (!upstream.ok) return new Response("Not found", { status: upstream.status });
        const ext = file.split(".").pop()?.toLowerCase() ?? "";
        const headers = new Headers({
          "content-type": TYPES[ext] ?? "application/octet-stream",
          "cache-control": "public, max-age=86400",
        });
        // No content-length: upstream may be gzip and fetch decompresses it.
        return new Response(upstream.body, { status: 200, headers });
      },
    },
  },
});
