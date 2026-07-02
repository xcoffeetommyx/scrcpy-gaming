import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { DeviceStatusCard } from "./components/DeviceStatusCard";
import { LogPanel } from "./components/LogPanel";
import { ProfileSelector } from "./components/ProfileSelector";
import { PROFILES } from "./profiles";
import type {
  DeviceSnapshot,
  LaunchRequest,
  LogEvent,
  ProcessStateEvent,
  Profile,
} from "./types";

const POLL_INTERVAL_MS = 1_500;
const MAX_LOG_LINES = 240;

const INITIAL_DEVICE: DeviceSnapshot = {
  kind: "noDevice",
  title: "Looking for your Android device",
  message: "Connect your phone with USB debugging enabled.",
  serial: null,
  model: null,
  count: 0,
};

function appendBounded(
  current: readonly LogEvent[],
  next: LogEvent,
): LogEvent[] {
  return [...current, next].slice(-MAX_LOG_LINES);
}

function friendlyError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

export default function App() {
  const [device, setDevice] = useState<DeviceSnapshot>(INITIAL_DEVICE);
  const [profile, setProfile] = useState<Profile>("balanced");
  const [running, setRunning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<LogEvent[]>([
    {
      source: "system",
      message: "Scrcpy GO is ready. Connect a device to begin.",
    },
  ]);

  const pollInFlight = useRef(false);
  const mounted = useRef(true);

  const addLog = useCallback((entry: LogEvent) => {
    setLogs((current) => appendBounded(current, entry));
  }, []);

  const refreshDevices = useCallback(async () => {
    if (pollInFlight.current) {
      return;
    }

    pollInFlight.current = true;
    setRefreshing(true);
    try {
      const snapshot = await invoke<DeviceSnapshot>("get_device_status");
      if (mounted.current) {
        setDevice(snapshot);
      }
    } catch (error) {
      if (mounted.current) {
        setDevice({
          kind: "adbError",
          title: "Backend unavailable",
          message: friendlyError(error),
          serial: null,
          model: null,
          count: 0,
        });
      }
    } finally {
      pollInFlight.current = false;
      if (mounted.current) {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshDevices();
    const interval = window.setInterval(refreshDevices, POLL_INTERVAL_MS);
    const listeners: Promise<UnlistenFn>[] = [
      listen<LogEvent>("scrcpy-log", ({ payload }) => addLog(payload)),
      listen<ProcessStateEvent>("scrcpy-process-state", ({ payload }) => {
        setRunning(payload.running);
        setBusy(false);
        if (!payload.running) {
          addLog({
            source: "system",
            message:
              payload.exitCode === null
                ? "Mirroring stopped."
                : `Mirroring ended (exit ${payload.exitCode}).`,
          });
        }
      }),
    ];

    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      void Promise.all(listeners).then((unlisten) => {
        unlisten.forEach((fn) => fn());
      });
    };
  }, [addLog, refreshDevices]);

  const launch = async () => {
    if (!device.serial || device.kind !== "connected" || running || busy) {
      return;
    }

    setBusy(true);
    const request: LaunchRequest = {
      serial: device.serial,
      profile,
    };

    try {
      await invoke("launch_scrcpy", { request });
      setRunning(true);
      addLog({
        source: "system",
        message: `Mirroring started in ${
          PROFILES.find((option) => option.id === profile)?.name ?? profile
        } mode.`,
      });
    } catch (error) {
      setBusy(false);
      addLog({ source: "system", message: friendlyError(error) });
    }
  };

  const stop = async () => {
    if (!running || busy) {
      return;
    }
    setBusy(true);
    try {
      await invoke("stop_scrcpy");
      addLog({ source: "system", message: "Stopping mirroring…" });
    } catch (error) {
      setBusy(false);
      addLog({ source: "system", message: friendlyError(error) });
    }
  };

  const launchDisabled =
    device.kind !== "connected" || running || busy || !device.serial;
  const selectedProfile =
    PROFILES.find((option) => option.id === profile)?.name ?? profile;

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span className="brand-mark__screen" />
            <span className="brand-mark__signal" />
          </div>
          <div className="hero__title">
            <h1>
              Scrcpy <em>GO</em>
            </h1>
            <p>Gaming Optimized</p>
          </div>
        </div>
        <div className={`session-pill ${running ? "is-running" : ""}`}>
          <span />
          {running ? "Session active" : "Ready to play"}
        </div>
      </header>

      <section className="workspace">
        <div className="section-title">
          <h2>Device</h2>
          <p>USB debugging required</p>
        </div>

        <DeviceStatusCard
          snapshot={device}
          refreshing={refreshing}
          onRefresh={() => void refreshDevices()}
        />

        <ProfileSelector
          selected={profile}
          disabled={running || busy}
          onChange={setProfile}
        />

        <section className="launch-zone" aria-label="Launch controls">
          <div className="launch-summary">
            <span>
              {running
                ? "Mirroring now"
                : launchDisabled
                  ? "Before you start"
                  : "Ready to play"}
            </span>
            <strong>{selectedProfile} profile</strong>
            <p>
              {running
                ? "Your game is running in a separate window."
                : launchDisabled
                  ? "Connect one authorized device to continue."
                  : "Your device and controller setup are ready."}
            </p>
          </div>

          <div className="launch-actions">
            {running && (
              <button
                className="button button--stop"
                type="button"
                onClick={() => void stop()}
                disabled={busy}
              >
                <span className="stop-square" />
                Stop
              </button>
            )}
            <button
              className="button button--launch"
              type="button"
              onClick={() => void launch()}
              disabled={launchDisabled}
            >
              <span className="button__label">
                {busy ? "Working…" : running ? "Running" : "GO"}
              </span>
              <span className="button__hint">
                {running ? "Session active" : "Start mirroring"}
              </span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          </div>
        </section>

        <aside className="controller-tip">
          <div className="controller-icon" aria-hidden="true">
            <span className="controller-dpad">+</span>
            <span className="controller-buttons">••</span>
          </div>
          <p>
            <strong>Using a controller?</strong>
            Connect it before launching. Game Mode uses Android UHID
            forwarding.
          </p>
        </aside>

        <LogPanel logs={logs} onClear={() => setLogs([])} />
      </section>
    </main>
  );
}
