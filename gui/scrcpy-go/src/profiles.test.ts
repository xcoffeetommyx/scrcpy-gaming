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
});
