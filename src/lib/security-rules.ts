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