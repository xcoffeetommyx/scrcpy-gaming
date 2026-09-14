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
  serial: string;
}

export interface LogEvent {
  source: "scrcpy" | "system";
  serial?: string | null;
  message: string;
}

export interface ProcessStateEvent {
  serial: string;
  pid: number;
  running: boolean;
  exitCode: number | null;
}

export interface PerformanceEvent {
  serial: string;
  pid: number;
  renderedFps: number;
  skippedFrames: number;
}
