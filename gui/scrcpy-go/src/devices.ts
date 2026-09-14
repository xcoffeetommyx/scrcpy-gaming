import type { AdbDevice } from "./types";

export function isReadyDevice(device: AdbDevice): boolean {
  return device.state === "device";
}

export function isEmulator(device: AdbDevice): boolean {
  return device.serial.toLowerCase().startsWith("emulator-");
}

export function chooseDeviceSerial(
  devices: readonly AdbDevice[],
  currentSerial: string | null,
): string | null {
  if (
    currentSerial &&
    devices.some(
      (device) => device.serial === currentSerial && isReadyDevice(device),
    )
  ) {
    return currentSerial;
  }

  return (
    devices.find((device) => isReadyDevice(device) && !isEmulator(device))
      ?.serial ??
    devices.find(isReadyDevice)?.serial ??
    null
  );
}

export function formatDeviceName(device: AdbDevice): string {
  return device.model?.replaceAll("_", " ") || device.serial;
}

export function formatDeviceOption(device: AdbDevice): string {
  const name = formatDeviceName(device);
  const connection = isEmulator(device) ? "Emulator" : "Device";
  const state = isReadyDevice(device) ? connection : device.state;
  return `${name} — ${device.serial} (${state})`;
}
