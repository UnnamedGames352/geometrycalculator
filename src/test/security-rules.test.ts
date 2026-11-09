import { describe, expect, it } from "vitest";
import { DEVICE_ID_PATTERN, FAILURE_LIMIT, FAILURE_WINDOW_MS, GUARD_INTERVAL_MS, IDLE_LIMIT_MS, isChromeOSChrome, isFriendOnline } from "@/lib/security-rules";

describe("Security controls", () => {
  it("allows Chrome on ChromeOS", () => expect(isChromeOSChrome("Mozilla/5.0 (X11; CrOS x86_64 16000.0.0) Chrome/130.0.0.0 Safari/537.36")).toBe(true));
  it("rejects other operating systems and browser wrappers", () => {
    for (const ua of ["Windows Chrome/130.0", "CrOS Chrome/130 Edg/130", "CrOS Chrome/130 OPR/90", "CrOS Firefox/130"]) expect(isChromeOSChrome(ua)).toBe(false);
  });
  it("uses browser UUIDs, not IP addresses", () => {
    expect(DEVICE_ID_PATTERN.test("d0f10db0-1111-4000-8000-000000000001")).toBe(true);
    expect(DEVICE_ID_PATTERN.test("192.168.1.1")).toBe(false);
  });
  it("sets auto-ban at three failures within five minutes", () => {
    expect(FAILURE_LIMIT).toBe(3);
    expect(FAILURE_WINDOW_MS).toBe(300_000);
  });
  it("polls eviction every two seconds", () => expect(GUARD_INTERVAL_MS).toBe(2000));
  it("locks after fifteen idle minutes", () => expect(IDLE_LIMIT_MS).toBe(900_000));
  it("counts online friends only within the last two minutes", () => {
    const now = 1_000_000;
    const f = { online:true, paused:false, expires_at:null, last_seen:new Date(now-119_999).toISOString() };
    expect(isFriendOnline(f,now)).toBe(true);
    expect(isFriendOnline({...f,last_seen:new Date(now-120_000).toISOString()},now)).toBe(false);
    expect(isFriendOnline({...f,online:false},now)).toBe(false);
  });
});