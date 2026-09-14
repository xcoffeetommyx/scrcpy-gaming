export type Profile = "competitive" | "balanced" | "quality";

export type DeviceState =
  | "noDevice"
  | "connected"
  | "unauthorized"
  | "unavailable"
  | "adbError";

export interface AdbDevice {
  serial: string;
  state: string;
  model: string | null;
}

export interface DeviceSnapshot {
  kind: DeviceState;
  title: string;
  message: string;
  count: number;
  readyCount: number;
  devices: AdbDevice[];
}

export interface LaunchRequest {
  serial: string;
  profile: Profile;
}

export interface LaunchResult {
  pid: number;
}

export interface LogEvent {
  source: "scrcpy" | "system";
  message: string;
}

export interface ProcessStateEvent {
  running: boolean;
  exitCode: number | null;
}
