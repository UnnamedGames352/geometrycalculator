function injectIntoHead(html: string, content: string): string {
  return html.replace(/<head\b[^>]*>/i, (head) => `${head}${content}`);
}

export function adaptCrazyCattleHtml(html: string): string {
  const styledHtml = html.replace(
    /#canvas\s*\{\s*display:\s*block;\s*\}/,
    "#canvas { display: block; width: 100vw; height: 100vh; position: absolute; top: 0; left: 0; touch-action: none; }",
  );
  const canvasHtml = styledHtml.replace(
    '<canvas id="canvas">',
    '<canvas id="canvas" tabindex="0">',
  );
  return canvasHtml.replace(
    "</canvas>",
    `</canvas>
    <script>
      const gameCanvas = document.getElementById("canvas");
      if (gameCanvas) {
        gameCanvas.addEventListener("pointerdown", () => gameCanvas.focus());
        gameCanvas.addEventListener("touchstart", (event) => {
          gameCanvas.focus();
          event.preventDefault();
        }, { passive: false });
        gameCanvas.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
      }
    </script>`,
  );
}

export function adaptCrazyCattleScript(script: string): string {
  return script.replace("GodotAudio.ctx&&GodotAudio.ctx.audioWorklet?1:0", "0");
}

export function adaptPolyTrackHtml(html: string): string {
  const headContent = `<style>
    #physics-loading {
      position: fixed;
      z-index: 99999;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 14px 20px;
      border: 1px solid rgba(255, 255, 255, 0.35);
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.82);
      color: #fff;
      font: 16px/1.4 sans-serif;
      pointer-events: none;
    }
    #physics-loading::before {
      content: "";
      display: inline-block;
      width: 12px;
      height: 12px;
      margin-right: 10px;
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-top-color: #fff;
      border-radius: 50%;
      vertical-align: -2px;
      animation: physics-loading-spin 0.8s linear infinite;
    }
    #physics-loading[data-ready="true"]::before { display: none; }
    @keyframes physics-loading-spin { to { transform: rotate(360deg); } }
  </style>`;
  const withStyles = injectIntoHead(html, headContent);
  const loaderScript = `<div id="physics-loading" role="status" aria-live="polite">
      Initializing physics engine (ammo.wasm)...
    </div>
    <script>
      (() => {
        const indicator = document.getElementById("physics-loading");
        const ui = document.getElementById("ui");
        if (!indicator || !ui) return;
        const showReady = () => {
          const visibleUi = Array.from(ui.children).some((element) =>
            !element.hidden &&
            !element.classList.contains("hidden") &&
            getComputedStyle(element).display !== "none"
          );
          if (!visibleUi) return;
          indicator.dataset.ready = "true";
          indicator.textContent = "Physics engine ready";
          observer.disconnect();
          setTimeout(() => indicator.remove(), 1200);
        };
        const observer = new MutationObserver(showReady);
        observer.observe(ui, {
          childList: true,
          attributes: true,
          attributeFilter: ["class", "hidden", "style"]
        });
        showReady();
        setTimeout(() => {
          if (indicator.isConnected && indicator.dataset.ready !== "true") {
            indicator.textContent = "Physics engine is still initializing...";
          }
        }, 15000);
      })();
    </script>`;
  const withIndicator = withStyles.replace(
    '<div id="transition-layer"></div>',
    `<div id="transition-layer"></div>${loaderScript}`,
  );
  return withIndicator.replace(
    '<script type="module" src="main.bundle.js" defer></script>',
    `<script>
      (() => {
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function () {
          const result = originalOpen.apply(this, arguments);
          const requestUrl = String(arguments[1]);
          if (requestUrl.startsWith("https://vps.kodub.com:43273/")) {
            this.timeout = Math.min(this.timeout || 750, 750);
          }
          return result;
        };
      })();
    </script>
    <script type="module" src="main.bundle.js" defer></script>`,
  );
}

export function adaptHollowKnightHtml(html: string): string {
  const withoutCutscenePrefetch = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (script) => {
    if (!script.includes("const FILES = [") || !script.includes('const DB_NAME = "asset-cache"')) {
      return script;
    }

    const cachedVideoKeys = [...script.matchAll(/"(\.\/StreamingAssets\/[^"]+\.mp4)"/g)].map(
      (match) => match[1],
    );
    return `<script>
      (() => {
        if (!window.indexedDB) return;
        const videoKeys = ${JSON.stringify(cachedVideoKeys)};
        const request = indexedDB.open("asset-cache", 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("files")) {
            request.result.createObjectStore("files");
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("files")) {
            db.close();
            return;
          }
          const transaction = db.transaction("files", "readwrite");
          const store = transaction.objectStore("files");
          videoKeys.forEach((key) => store.delete(key));
          transaction.oncomplete = () => db.close();
          transaction.onerror = () => {
            db.close();
            console.error("Could not clear obsolete cutscene cache", transaction.error);
          };
        };
        request.onerror = () => console.error("Could not open obsolete cutscene cache", request.error);
      })();
    </script>`;
  });

  return withoutCutscenePrefetch.replace(
    /async function fetchWithProgress\(url\) \{[\s\S]*?\n[ ]{8}\}/,
    `async function fetchWithProgress(url) {
            for (let attempt = 0; attempt < 4; attempt++) {
                let received = 0;
                const chunks = [];
                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error("HTTP " + response.status);
                    if (!response.body) throw new Error("Response body is unavailable");
                    const reader = response.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        received += value.length;
                        loadedBytes += value.length;
                        chunks.push(value);
                        const mbDone = (loadedBytes / (1024 * 1024)).toFixed(2);
                        const mbTotal = "886.65";
                        loadingText.textContent = \`LOADING... \${mbDone} MB / \${mbTotal} MB\`;
                    }
                    const fullBuffer = new Uint8Array(received);
                    let offset = 0;
                    for (const chunk of chunks) {
                        fullBuffer.set(chunk, offset);
                        offset += chunk.length;
                    }
                    return fullBuffer.buffer;
                } catch (error) {
                    loadedBytes -= received;
                    if (attempt === 3) throw error;
                    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
                }
            }
            throw new Error("Unable to download " + url);
        }`,
  );
}
