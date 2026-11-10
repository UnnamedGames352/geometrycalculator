import { describe, expect, it } from "vitest";
import { addPlaytime, creditSeconds, formatDuration, parseBrowserVersion, parseHardware, topGame } from "@/lib/security-rules";

describe("Player roster", () => {
  const t = (ms: number) => new Date(ms).toISOString();
  it("credits play only until the browser last checked in", () => {
    expect(creditSeconds(t(0), t(600_000), 3_600_000)).toBe(600);
  });
  it("never credits negative or missing time", () => {
    expect(creditSeconds(null, t(1000), 5000)).toBe(0);
    expect(creditSeconds(t(5000), t(1000), 9000)).toBe(0);
  });
  it("caps one session at 12 hours", () => expect(creditSeconds(t(0), t(48 * 3600_000), 48 * 3600_000)).toBe(43_200));
  it("adds per-game time and picks the most played game", () => {
    const p = addPlaytime(addPlaytime({ Brotato: 100 }, "Slope", 300), "Brotato", 50);
    expect(p).toEqual({ Brotato: 150, Slope: 300 });
    expect(topGame(p)).toEqual({ game: "Slope", seconds: 300 });
    expect(topGame({})).toBeNull();
  });
  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(59)).toBe("under a minute");
    expect(formatDuration(3720)).toBe("1 h 2 min");
  });
  it("reads Chrome and ChromeOS versions", () => {
    expect(parseBrowserVersion("Mozilla/5.0 (X11; CrOS x86_64 15723.44.0) AppleWebKit/537.36 Chrome/122.0.6261.94 Safari/537.36")).toBe("Chrome 122.0.6261.94 · ChromeOS 15723.44.0");
  });
  it("rejects bogus hardware values", () => {
    expect(parseHardware({ screen: "<script>", cores: 9999, memory: -1 })).toEqual({ screen: null, cores: null, memory: null });
    expect(parseHardware({ screen: "1366×768 @ 1x", cores: 4, memory: 8 })).toEqual({ screen: "1366×768 @ 1x", cores: 4, memory: 8 });
  });
});
