import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Unnamed Games Hub — Play in your browser" },
      { name: "description", content: "Unnamed Games Hub: play Brotato and more right in your browser." },
      { property: "og:title", content: "Unnamed Games Hub" },
      { property: "og:description", content: "Play Brotato and more right in your browser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const games = [
  { id: "brotato", name: "Brotato", src: "/games/brotato/index.html", img: "/games/brotato/index.png", size: "~220 MB first load" },
];

function Index() {
  const [playing, setPlaying] = useState<string | null>(null);
  const game = games.find((g) => g.id === playing);

  if (game) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <button onClick={() => setPlaying(null)} className="font-bold text-primary">← Hub</button>
          <span className="font-black tracking-wide text-foreground">{game.name}</span>
          <a href={game.src} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground">Fullscreen ↗</a>
        </div>
        <iframe src={game.src} title={game.name} className="flex-1 w-full border-0" allow="autoplay; fullscreen; gamepad" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background px-6 py-12 text-foreground">
      <h1 className="text-5xl font-black uppercase tracking-tight">Unnamed <span className="text-primary">Games</span></h1>
      <p className="mt-2 text-muted-foreground">Pick a game and play.</p>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {games.map((g) => (
          <button key={g.id} onClick={() => setPlaying(g.id)} className="group overflow-hidden rounded-xl border border-border bg-card text-left transition hover:-translate-y-1 hover:border-primary">
            <img src={g.img} alt={g.name} className="aspect-video w-full object-cover" />
            <div className="p-4">
              <div className="text-xl font-bold">{g.name}</div>
              <div className="text-xs text-muted-foreground">{g.size}</div>
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}
