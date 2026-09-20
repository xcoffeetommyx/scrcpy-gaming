import type { DisplayMode, DisplayRequest, FramePacing, WindowMode } from "./types";

export interface DisplaySettings {
  mode: DisplayMode;
  width: string;
  height: string;
  packageName: string;
  windowMode: WindowMode;
  framePacing: FramePacing;
  phoneScreenOff: boolean;
}

export const DEFAULT_DISPLAY: DisplaySettings = {
  mode: "native",
  width: "1920",
  height: "1080",
  packageName: "",
  windowMode: "windowed",
  framePacing: "smooth60",
  phoneScreenOff: true,
};

export const DISPLAY_MODES = [
  { id: "native", label: "Phone native" },
  { id: "gaming1080", label: "16:9 Gaming · 1920 × 1080" },
  { id: "performance720", label: "16:9 Performance · 1280 × 720" },
  { id: "custom", label: "Custom resolution" },
] as const;

export function displayError(settings: DisplaySettings): string | null {
  if (settings.mode === "native") return null;
  if (settings.mode === "custom") {
    const validDimension = (value: string) =>
      /^\d+$/.test(value) && Number(value) >= 320 &&
      Number(value) <= 8192 && Number(value) % 8 === 0;
    if (!validDimension(settings.width) || !validDimension(settings.height)) {
      return "Use dimensions from 320 to 8192 pixels, in multiples of 8.";
    }
  }
  if (settings.packageName.trim() && (
    settings.packageName.trim().length > 255 ||
    !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(settings.packageName.trim())
  )) {
    return "Enter a valid Android package name, such as com.example.game.";
  }
  return null;
}

export function displayRequest(settings: DisplaySettings): {
  display: DisplayRequest;
  startApp: string | null;
  windowMode: WindowMode;
  framePacing: FramePacing;
  phoneScreenOff: boolean;
} {
  const error = displayError(settings);
  if (error) throw new Error(error);
  return {
    windowMode: settings.windowMode,
    framePacing: settings.framePacing,
    phoneScreenOff: settings.phoneScreenOff,
    display: settings.mode === "custom"
      ? { mode: "custom", width: Number(settings.width), height: Number(settings.height) }
      : { mode: settings.mode },
    startApp: settings.mode === "native" ? null : settings.packageName.trim() || null,
  };
}

export function displaySummary(settings: DisplaySettings): string {
  switch (settings.mode) {
    case "native": return "Phone native";
    case "gaming1080": return "1920 × 1080";
    case "performance720": return "1280 × 720";
    case "custom": return `${settings.width} × ${settings.height}`;
  }
}
