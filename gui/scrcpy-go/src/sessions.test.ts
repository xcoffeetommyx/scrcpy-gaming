import { describe, expect, it } from "vitest";
import {
  applyProcessState,
  setDeviceProfile,
  setSerialMembership,
} from "./sessions";

describe("multi-device session state", () => {
  it("tracks simultaneous sessions independently", () => {
    let sessions = applyProcessState(new Map(), {
      serial: "phone",
      pid: 10,
      running: true,
      exitCode: null,
    });
    sessions = applyProcessState(sessions, {
      serial: "emulator-5554",
      pid: 20,
      running: true,
      exitCode: null,
    });

    expect([...sessions.entries()]).toEqual([
      ["phone", 10],
      ["emulator-5554", 20],
    ]);
  });

  it("removes only the session which exited", () => {
    const sessions = new Map([
      ["phone", 10],
      ["emulator-5554", 20],
    ]);
    const next = applyProcessState(sessions, {
      serial: "phone",
      pid: 10,
      running: false,
      exitCode: 0,
    });

    expect([...next.entries()]).toEqual([["emulator-5554", 20]]);
  });

  it("ignores a late exit event from a replaced process", () => {
    const sessions = new Map([["phone", 11]]);
    const next = applyProcessState(sessions, {
      serial: "phone",
      pid: 10,
      running: false,
      exitCode: 1,
    });

    expect(next.get("phone")).toBe(11);
  });

  it("tracks per-device busy state", () => {
    let busy = setSerialMembership(new Set(), "phone", true);
    busy = setSerialMembership(busy, "emulator-5554", true);
    expect(busy.has("phone")).toBe(true);
    busy = setSerialMembership(busy, "phone", false);
    expect([...busy]).toEqual(["emulator-5554"]);
  });

  it("keeps profile choices independent per device", () => {
    let profiles = setDeviceProfile(new Map(), "phone", "quality");
    profiles = setDeviceProfile(profiles, "emulator-5554", "competitive");

    expect(profiles.get("phone")).toBe("quality");
    expect(profiles.get("emulator-5554")).toBe("competitive");
  });
});
