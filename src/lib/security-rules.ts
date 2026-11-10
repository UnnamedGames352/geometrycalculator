export const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const FAILURE_LIMIT = 3;
export const FAILURE_WINDOW_MS = 5 * 60_000;
export const GUARD_INTERVAL_MS = 2000;
export const IDLE_LIMIT_MS = 15 * 60_000;
export function isChromeOSChrome(ua: string) {
  return /CrOS\b/.test(ua) && /Chrome\//.test(ua) && !/Edg|OPR|Opera|Brave|Vivaldi|SamsungBrowser|YaBrowser|Firefox|FxiOS|CriOS|DuckDuckGo/i.test(ua);
}
export function getBrowserDeviceId(): string {
  const stored = localStorage.getItem("device-id");
  if (stored && DEVICE_ID_PATTERN.test(stored)) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem("device-id", id);
  return id;
}
export function isFriendOnline(friend: { online: boolean; paused: boolean; expires_at: string | null; last_seen: string | null }, now: number) {
  return friend.online && !friend.paused && (!friend.expires_at || Date.parse(friend.expires_at) > now)
    && !!friend.last_seen && now - Date.parse(friend.last_seen) < 120_000;
}
export const MAX_SESSION_CREDIT_SECONDS = 12 * 3600;

/** Seconds of play to credit: from game start until the last time the friend's browser checked in. */
export function creditSeconds(startedAt: string | null, lastSeen: string | null, now: number) {
  if (!startedAt) return 0;
  const start = Date.parse(startedAt);
  const end = Math.min(now, lastSeen ? Date.parse(lastSeen) : now);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.min(MAX_SESSION_CREDIT_SECONDS, Math.floor((end - start) / 1000));
}

export type PlaySeconds = Record<string, number>;

export function addPlaytime(play: unknown, game: string | null, seconds: number): PlaySeconds {
  const base: PlaySeconds = {};
  if (play && typeof play === "object" && !Array.isArray(play)) {
    for (const [k, v] of Object.entries(play)) if (typeof v === "number" && Number.isFinite(v) && v > 0) base[k] = v;
  }
  if (game && seconds > 0) base[game] = (base[game] ?? 0) + seconds;
  return base;
}

export function topGame(play: unknown): { game: string; seconds: number } | null {
  const entries = Object.entries(addPlaytime(play, null, 0)).sort((a, b) => b[1] - a[1]);
  return entries[0] ? { game: entries[0][0], seconds: entries[0][1] } : null;
}

export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return s === 0 ? "0 min" : "under a minute";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** "Chrome 122.0.6261.94 · ChromeOS 15723.44.0" from a User-Agent string. */
export function parseBrowserVersion(ua: string) {
  const chrome = /Chrome\/([\d.]+)/.exec(ua)?.[1];
  const cros = /CrOS \S+ ([\d.]+)/.exec(ua)?.[1];
  return [chrome && `Chrome ${chrome}`, cros && `ChromeOS ${cros}`].filter(Boolean).join(" · ") || null;
}

export type Hardware = { screen: string | null; cores: number | null; memory: number | null };

/** Browser-reported hardware hints. Values are approximate and self-reported, never a serial number. */
export function getHardwareSnapshot(): Hardware {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const w = window.screen?.width, h = window.screen?.height;
  return {
    screen: w && h ? `${w}×${h} @ ${Math.round((window.devicePixelRatio || 1) * 100) / 100}x` : null,
    cores: nav.hardwareConcurrency || null,
    memory: nav.deviceMemory ?? null,
  };
}

export function parseHardware(h: unknown): Hardware {
  const o = (h && typeof h === "object" ? h : {}) as Record<string, unknown>;
  const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max ? v : null);
  return {
    screen: typeof o["screen"] === "string" && /^[0-9]{2,5}×[0-9]{2,5} @ [0-9.]{1,6}x$/.test(o["screen"]) ? o["screen"] : null,
    cores: num(o["cores"], 256),
    memory: num(o["memory"], 1024),
  };
}
