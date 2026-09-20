import { describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY, displayError, displayRequest } from "./display";

describe("display launch settings", () => {
  it("carries the phone screen preference in either display mode", () => {
    for (const mode of ["native", "gaming1080"] as const) {
      expect(displayRequest({ ...DEFAULT_DISPLAY, mode }).phoneScreenOff).toBe(true);
      expect(displayRequest({ ...DEFAULT_DISPLAY, mode, phoneScreenOff: false }).phoneScreenOff).toBe(false);
    }
  });

  it("carries fullscreen and timing settings for physical and virtual displays", () => {
    for (const mode of ["native", "gaming1080"] as const) {
      expect(displayRequest({ ...DEFAULT_DISPLAY, mode, windowMode: "exclusive", framePacing: "smooth120" }))
        .toMatchObject({ windowMode: "exclusive", framePacing: "smooth120" });
    }
    expect(displayRequest({ ...DEFAULT_DISPLAY, framePacing: "lowLatency" }))
      .toMatchObject({ windowMode: "windowed", framePacing: "lowLatency" });
  });

  it("keeps native mirroring free of virtual-display and app settings", () => {
    expect(displayRequest({ ...DEFAULT_DISPLAY, width: "", packageName: "invalid" }))
      .toEqual({ phoneScreenOff: true, windowMode: "windowed", framePacing: "smooth60", display: { mode: "native" }, startApp: null });
  });

  it("launches either preset without requiring an app", () => {
    for (const mode of ["gaming1080", "performance720"] as const) {
      expect(displayRequest({ ...DEFAULT_DISPLAY, mode }))
        .toEqual({ phoneScreenOff: true, windowMode: "windowed", framePacing: "smooth60", display: { mode }, startApp: null });
    }
  });

  it("converts custom dimensions and trims optional packages", () => {
    expect(displayRequest({ ...DEFAULT_DISPLAY, mode: "custom", width: "2560", height: "1440", packageName: " com.example.game " }))
      .toEqual({ phoneScreenOff: true, windowMode: "windowed", framePacing: "smooth60", display: { mode: "custom", width: 2560, height: 1440 }, startApp: "com.example.game" });
  });

  it("blocks incomplete or unsupported custom dimensions", () => {
    for (const width of ["", "0", "319", "1921", "8193", "1920.5", "1e3", "NaN"]) {
      const settings = { ...DEFAULT_DISPLAY, mode: "custom" as const, width };
      expect(displayError(settings)).toContain("dimensions");
      expect(() => displayRequest(settings)).toThrow();
    }
    expect(displayError({ ...DEFAULT_DISPLAY, mode: "custom", height: "" })).toContain("dimensions");
  });

  it("rejects commands and scrcpy app prefixes as package names", () => {
    for (const packageName of ["com..game", "--no-control", "+com.example.game", "com.game;cmd", "com.game\nextra"]) {
      expect(displayError({ ...DEFAULT_DISPLAY, mode: "gaming1080", packageName })).toContain("package name");
    }
  });
});
