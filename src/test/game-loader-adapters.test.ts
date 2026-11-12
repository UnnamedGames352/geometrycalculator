import { describe, expect, it } from "vitest";

import {
  adaptCrazyCattleHtml,
  adaptCrazyCattleScript,
  adaptHollowKnightHtml,
  adaptPolyTrackHtml,
} from "@/lib/game-loader-adapters";

describe("game loader adapters", () => {
  it("uses Godot's ScriptProcessor fallback and gives the canvas mobile sizing and input handlers", () => {
    const html = adaptCrazyCattleHtml(
      '<head><style>#canvas { display: block; }</style></head><canvas id="canvas"></canvas>',
    );
    const script = adaptCrazyCattleScript(
      "function hasWorklet(){return GodotAudio.ctx&&GodotAudio.ctx.audioWorklet?1:0}",
    );

    expect(script).toContain("function hasWorklet(){return 0}");
    expect(html).toContain("width: 100vw; height: 100vh; position: absolute; top: 0; left: 0;");
    expect(html).toContain('addEventListener("pointerdown"');
    expect(html).toContain('addEventListener("touchstart"');
  });

  it("shows Poly Track initialization status and caps Kodub requests", () => {
    const html = adaptPolyTrackHtml(
      '<head></head><div id="ui"></div><div id="transition-layer"></div><script type="module" src="main.bundle.js" defer></script>',
    );

    expect(html).toContain("Initializing physics engine (ammo.wasm)");
    expect(html).toContain("Physics engine is still initializing");
    expect(html).toContain("Math.min(this.timeout || 750, 750)");
    expect(html).toContain('src="main.bundle.js"');
  });

  it("stops eager Hollow Knight cutscene caching and retries interrupted chunks", () => {
    const html = adaptHollowKnightHtml(`<script>
      (async () => {
        const FILES = ["./StreamingAssets/Intro.mp4"];
        const DB_NAME = "asset-cache";
        await Promise.all(FILES.map(fetch));
      })();
    </script>
    <script>
      async function fetchWithProgress(url) {
        const response = await fetch(url);
        return response.arrayBuffer();
        }
    </script>`);

    expect(html).not.toContain("await Promise.all(FILES.map(fetch))");
    expect(html).toContain('videoKeys = ["./StreamingAssets/Intro.mp4"]');
    expect(html).toContain("attempt < 4");
    expect(html).toContain("250 * 2 ** attempt");
  });
});
