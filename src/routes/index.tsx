import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UnnamedGamesHub — Play games in your browser" },
      { name: "description", content: "UnnamedGamesHub: Brotato, Tanuki Sunset, Slope, Retro Bowl and more, playable in your browser." },
      { property: "og:title", content: "UnnamedGamesHub" },
      { property: "og:description", content: "Brotato, Tanuki Sunset, Slope, Retro Bowl and more in your browser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

// The hub is the user's original HTML page, served as-is.
function Index() {
  return <iframe src="/hub.html" title="UnnamedGamesHub" className="fixed inset-0 h-full w-full border-0" />;
}
