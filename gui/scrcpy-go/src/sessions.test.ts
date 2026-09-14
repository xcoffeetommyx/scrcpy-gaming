import { describe, expect, it } from "vitest";
import {
  applyPerformanceSample,
  applyProcessState,
  clearPerformanceSample,
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

  it("tracks performance samples independently per session", () => {
    let samples = applyPerformanceSample(new Map(), {
      serial: "phone",
      pid: 10,
      renderedFps: 120,
      skippedFrames: 0,
    });
    samples = applyPerformanceSample(samples, {
      serial: "emulator-5554",
      pid: 20,
      renderedFps: 60,
      skippedFrames: 2,
    });

    expect(samples.get("phone")?.renderedFps).toBe(120);
    expect(samples.get("emulator-5554")?.skippedFrames).toBe(2);
  });

  it("does not clear telemetry for a replacement session", () => {
    const samples = new Map([
      [
        "phone",
        {
          serial: "phone",
          pid: 11,
          renderedFps: 90,
          skippedFrames: 0,
        },
      ],
    ]);

    const afterLateExit = clearPerformanceSample(samples, {
      serial: "phone",
      pid: 10,
      running: false,
      exitCode: 1,
    });
    expect(afterLateExit.has("phone")).toBe(true);

    const afterCurrentExit = clearPerformanceSample(afterLateExit, {
      serial: "phone",
      pid: 11,
      running: false,
      exitCode: 0,
    });
    expect(afterCurrentExit.has("phone")).toBe(false);
  });
});
