import { describe, expect, it } from "vitest";
import { isProfile, PROFILES } from "./profiles";

describe("game mode profiles", () => {
  it("exposes the three launcher profiles in display order", () => {
    expect(PROFILES.map((profile) => profile.id)).toEqual([
      "competitive",
      "balanced",
      "quality",
    ]);
  });

  it("rejects values outside the frontend contract", () => {
    expect(isProfile("competitive")).toBe(true);
    expect(isProfile("ultra")).toBe(false);
  });

  it("keeps audio disabled only for the competitive profile", () => {
    expect(PROFILES.find((profile) => profile.id === "competitive")?.specs)
      .toContain("Audio off");
    expect(PROFILES.find((profile) => profile.id === "balanced")?.specs)
      .toContain("Audio on · 40 ms buffer");
    expect(PROFILES.find((profile) => profile.id === "quality")?.specs)
      .toContain("Audio on · 40 ms buffer");
  });
});
