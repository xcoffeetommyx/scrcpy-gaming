export type Profile = "competitive" | "balanced" | "quality";

export type DisplayMode = "native" | "gaming1080" | "performance720" | "custom";
export type WindowMode = "windowed" | "borderless" | "exclusive";
export type FramePacing = "smooth60" | "smooth120" | "lowLatency";

export type DisplayRequest =
  | { mode: Exclude<DisplayMode, "custom"> }
  | { mode: "custom"; width: number; height: number };

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
  display: DisplayRequest;
  startApp: string | null;
  windowMode: WindowMode;
  framePacing: FramePacing;
  phoneScreenOff: boolean;
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
  averageFrameMs?: number | null;
  longestFrameMs?: number | null;
}
