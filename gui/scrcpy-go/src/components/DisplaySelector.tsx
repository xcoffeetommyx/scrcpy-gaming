import { DISPLAY_MODES, displayError, type DisplaySettings } from "../display";
import type { DisplayMode } from "../types";

interface DisplaySelectorProps {
  settings: DisplaySettings;
  disabled: boolean;
  onChange: (settings: DisplaySettings) => void;
}

export function DisplaySelector({ settings, disabled, onChange }: DisplaySelectorProps) {
  const virtual = settings.mode !== "native";
  const error = displayError(settings);
  return (
    <fieldset className="panel display-panel" disabled={disabled}>
      <legend className="sr-only">Gaming display</legend>
      <header className="panel-header">
        <div>
          <span className="panel-kicker">Display</span>
          <h2>Fit your game to your screen</h2>
        </div>
        <span className="panel-meta">{virtual ? "Virtual Android display" : "Phone screen"}</span>
      </header>
      <div className="display-fields">
        <label className="display-field">
          <span>Display mode</span>
          <select value={settings.mode} onChange={(event) =>
            onChange({ ...settings, mode: event.target.value as DisplayMode })}>
            {DISPLAY_MODES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label className="display-field">
          <span>Window mode</span>
          <select value={settings.windowMode} onChange={(event) =>
            onChange({ ...settings, windowMode: event.target.value as DisplaySettings["windowMode"] })}>
            <option value="windowed">Windowed</option>
            <option value="borderless">Borderless fullscreen</option>
            <option value="exclusive">Exclusive fullscreen</option>
          </select>
        </label>
        <label className="display-field">
          <span>Frame pacing</span>
          <select value={settings.framePacing} onChange={(event) =>
            onChange({ ...settings, framePacing: event.target.value as DisplaySettings["framePacing"] })}>
            <option value="smooth60">Smooth 60 FPS · recommended</option>
            <option value="smooth120">Smooth 120 FPS</option>
            <option value="lowLatency">Minimum latency · up to 120 FPS</option>
          </select>
        </label>
        <label className="display-field">
          <span>Phone screen</span>
          <select value={settings.phoneScreenOff ? "off" : "on"} onChange={(event) =>
            onChange({ ...settings, phoneScreenOff: event.target.value === "off" })}>
            <option value="off">Black while streaming</option>
            <option value="on">Leave on</option>
          </select>
        </label>
        {settings.mode === "custom" && (
          <div className="display-dimensions">
            <label className="display-field">
              <span>Width (px)</span>
              <input type="number" min="320" max="8192" step="8" value={settings.width}
                aria-describedby="display-hint display-error"
                onChange={(event) => onChange({ ...settings, width: event.target.value })} />
            </label>
            <label className="display-field">
              <span>Height (px)</span>
              <input type="number" min="320" max="8192" step="8" value={settings.height}
                aria-describedby="display-hint display-error"
                onChange={(event) => onChange({ ...settings, height: event.target.value })} />
            </label>
          </div>
        )}
        {virtual && (
          <label className="display-field">
            <span>Start an app (optional package name)</span>
            <input type="text" spellCheck={false} autoCapitalize="none" maxLength={255}
              placeholder="Leave blank to use the Android launcher" value={settings.packageName}
              aria-describedby="display-error"
              onChange={(event) => onChange({ ...settings, packageName: event.target.value })} />
          </label>
        )}
      </div>
      <p className="display-hint">
        {settings.phoneScreenOff
          ? "The device screen goes black while streaming stays active. In virtual display mode, detected handheld controls stay connected by keeping the panel powered behind a black cover. The device remains unlocked; this does not PIN-lock it. Unlock it before starting. Its screen and charging sleep setting are restored when the session ends."
          : "The phone screen stays on normally."}
        {" Alt+O turns the phone screen off; Alt+Shift+O turns it back on. The power button may interrupt the virtual display."}
      </p>
      <p className="display-hint">
        {settings.framePacing === "lowLatency"
          ? "No video buffer or VSync. Fastest response, but uneven frame delivery may be visible."
          : `VSync with a ${settings.framePacing === "smooth60" ? "35" : "20"} ms video buffer to absorb delivery jitter. Set your game’s cap to ${settings.framePacing === "smooth60" ? "60" : "120"} FPS. Adds a little input delay.`}
        {settings.windowMode === "exclusive"
          ? " Exclusive mode requests a supported monitor refresh rate; the desktop mode is restored on exit. Alt+F switches to a window."
          : " Alt+F toggles fullscreen. For smooth playback, use a monitor refresh rate that matches or is a multiple of your game’s FPS."}
      </p>
      <p className="display-hint" id="display-hint">
        {virtual
          ? "Your game renders on a separate Android display at the selected resolution. The display stays awake during play."
          : "Mirror your phone’s screen shape. The performance profile controls the stream resolution."}
        {settings.mode === "custom" && " Use multiples of 8 pixels."}
      </p>
      {virtual && (
        <p className="display-hint">
          {!settings.packageName.trim()
            ? "Some phones have no launcher on virtual displays. If the window stays blank, stop and select an app."
            : "The app must be installed on your phone. Save your game before stopping; closing the virtual display closes its apps."}
        </p>
      )}
      <p className="display-error" id="display-error" role="status">{error}</p>
    </fieldset>
  );
}
