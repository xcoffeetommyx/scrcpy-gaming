export type Profile = "competitive" | "balanced" | "quality";

export type DeviceState =
  | "noDevice"
  | "connected"
  | "unauthorized"
  | "multipleDevices"
  | "unavailable"
  | "adbError";

export interface DeviceSnapshot {
  kind: DeviceState;
  title: string;
  message: string;
  serial: string | null;
  model: string | null;
  count: number;
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
