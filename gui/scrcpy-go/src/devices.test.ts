import { describe, expect, it } from "vitest";
import { chooseDeviceSerial, formatDeviceOption } from "./devices";
import type { AdbDevice } from "./types";

const emulator: AdbDevice = {
  serial: "emulator-5554",
  state: "device",
  model: "sdk_gphone64_x86_64",
};

const physical: AdbDevice = {
  serial: "R5CWB2H4YGD",
  state: "device",
  model: "SM_S916U1",
};

describe("device selection", () => {
  it("prefers a physical device over an emulator initially", () => {
    expect(chooseDeviceSerial([emulator, physical], null)).toBe(
      physical.serial,
    );
  });

  it("preserves an explicit emulator selection while it remains ready", () => {
    expect(chooseDeviceSerial([physical, emulator], emulator.serial)).toBe(
      emulator.serial,
    );
  });

  it("falls back when the selected device disconnects", () => {
    expect(chooseDeviceSerial([physical], emulator.serial)).toBe(
      physical.serial,
    );
  });

  it("does not select unauthorized or offline devices", () => {
    expect(
      chooseDeviceSerial(
        [
          { ...physical, state: "unauthorized" },
          { ...emulator, state: "offline" },
        ],
        physical.serial,
      ),
    ).toBeNull();
  });

  it("labels emulators distinctly in the picker", () => {
    expect(formatDeviceOption(emulator)).toContain("(Emulator)");
    expect(formatDeviceOption(physical)).toContain("(Device)");
  });
});
