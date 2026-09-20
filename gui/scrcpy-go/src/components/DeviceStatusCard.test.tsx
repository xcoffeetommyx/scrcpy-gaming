import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeviceStatusCard } from "./DeviceStatusCard";
import type { DeviceSnapshot } from "../types";

const physical = {
  serial: "phone-123",
  state: "device",
  model: "Galaxy_S23",
};
const emulator = {
  serial: "emulator-5554",
  state: "device",
  model: "Android_Emulator",
};

function render(snapshot: DeviceSnapshot, selectedSerial: string | null) {
  return renderToStaticMarkup(
    <DeviceStatusCard
      snapshot={snapshot}
      selectedSerial={selectedSerial}
      activeSessions={new Map()}
      refreshing={false}
      onSelect={() => {}}
      onRefresh={() => {}}
    />,
  );
}

describe("device status presentation", () => {
  it("keeps multi-device selection visible and identifies the selected device", () => {
    const markup = render(
      {
        kind: "connected",
        title: "Devices connected",
        message: "Choose a ready device.",
        count: 2,
        readyCount: 2,
        devices: [emulator, physical],
      },
      physical.serial,
    );

    expect(markup).toContain("Galaxy S23");
    expect(markup).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(markup).toContain('aria-label="Device to mirror"');
    expect(markup).toContain('value="phone-123" selected=""');
    expect(markup).toContain("Android Emulator");
  });

  it("shows recovery guidance for USB authorization", () => {
    const markup = render(
      {
        kind: "unauthorized",
        title: "Approve this computer",
        message: "Unlock the device and accept the USB debugging prompt.",
        count: 1,
        readyCount: 0,
        devices: [{ ...physical, state: "unauthorized" }],
      },
      null,
    );

    expect(markup).toContain("Approve this computer");
    expect(markup).toContain("accept the USB debugging prompt");
  });

  it("keeps backend details available without placing raw errors in the primary UI", () => {
    const rawError = "backend failure: path C:\\example\\scrcpy.exe";
    const markup = render(
      {
        kind: "adbError",
        title: "Backend unavailable",
        message: rawError,
        count: 0,
        readyCount: 0,
        devices: [],
      },
      null,
    );

    expect(markup).toContain("Could not reach the device service");
    expect(markup).toContain("<summary>Technical details</summary>");
    expect(markup).toContain(rawError);
    expect(markup).not.toContain("Android</span>");
  });
});
