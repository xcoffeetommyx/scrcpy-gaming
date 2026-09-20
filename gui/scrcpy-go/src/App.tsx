import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { DeviceStatusCard } from "./components/DeviceStatusCard";
import { LogPanel } from "./components/LogPanel";
import { ProfileSelector } from "./components/ProfileSelector";
import {
  chooseDeviceSerial,
  formatDeviceName,
  isReadyDevice,
} from "./devices";
import { PROFILES } from "./profiles";
import {
  applyPerformanceSample,
  applyProcessState,
  clearPerformanceSample,
  setDeviceProfile,
  setSerialMembership,
} from "./sessions";
import type {
  DeviceSnapshot,
  LaunchRequest,
  LaunchResult,
  LogEvent,
  PerformanceEvent,
  ProcessStateEvent,
  Profile,
} from "./types";

const POLL_INTERVAL_MS = 1_500;
const MAX_LOG_LINES = 240;

const INITIAL_DEVICE: DeviceSnapshot = {
  kind: "noDevice",
  title: "Looking for your Android device",
  message: "Connect your phone with USB debugging enabled.",
  count: 0,
  readyCount: 0,
  devices: [],
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
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(
    () => new Map(),
  );
  const [sessions, setSessions] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [performance, setPerformance] = useState<
    Map<string, PerformanceEvent>
  >(() => new Map());
  const [busySerials, setBusySerials] = useState<Set<string>>(
    () => new Set(),
  );
  const [refreshing, setRefreshing] = useState(false);
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
        setSelectedSerial((current) =>
          chooseDeviceSerial(snapshot.devices, current),
        );
      }
    } catch (error) {
      if (mounted.current) {
        setDevice({
          kind: "adbError",
          title: "Backend unavailable",
          message: friendlyError(error),
          count: 0,
          readyCount: 0,
          devices: [],
        });
        setSelectedSerial(null);
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
        setSessions((current) => applyProcessState(current, payload));
        setPerformance((current) =>
          clearPerformanceSample(current, payload),
        );
        setBusySerials((current) =>
          setSerialMembership(current, payload.serial, false),
        );
        if (!payload.running) {
          addLog({
            source: "system",
            serial: payload.serial,
            message:
              payload.exitCode === null
                ? "Mirroring stopped."
                : `Mirroring ended (exit ${payload.exitCode}).`,
          });
        }
      }),
      listen<PerformanceEvent>("scrcpy-performance", ({ payload }) => {
        setPerformance((current) =>
          applyPerformanceSample(current, payload),
        );
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

  const selectedDevice = device.devices.find(
    (candidate) => candidate.serial === selectedSerial,
  );
  const selectedDeviceReady = selectedDevice
    ? isReadyDevice(selectedDevice)
    : false;
  const selectedRunning = selectedSerial
    ? sessions.has(selectedSerial)
    : false;
  const selectedBusy = selectedSerial
    ? busySerials.has(selectedSerial)
    : false;
  const profile = selectedSerial
    ? profiles.get(selectedSerial) ?? "balanced"
    : "balanced";
  const activeSessionCount = sessions.size;
  const selectedPerformance = selectedSerial
    ? performance.get(selectedSerial)
    : undefined;
  const currentPerformance =
    selectedPerformance?.pid === sessions.get(selectedSerial ?? "")
      ? selectedPerformance
      : undefined;

  const selectProfile = (nextProfile: Profile) => {
    if (!selectedSerial) {
      return;
    }

    setProfiles((current) =>
      setDeviceProfile(current, selectedSerial, nextProfile),
    );
  };

  const launch = async () => {
    if (
      !selectedSerial ||
      !selectedDeviceReady ||
      selectedRunning ||
      selectedBusy
    ) {
      return;
    }

    const serial = selectedSerial;
    const deviceName = selectedDevice
      ? formatDeviceName(selectedDevice)
      : serial;
    setBusySerials((current) => setSerialMembership(current, serial, true));
    const request: LaunchRequest = {
      serial,
      profile,
    };

    try {
      const result = await invoke<LaunchResult>("launch_scrcpy", { request });
      setPerformance((current) => {
        const next = new Map(current);
        next.delete(serial);
        return next;
      });
      setSessions((current) =>
        applyProcessState(current, {
          serial: result.serial,
          pid: result.pid,
          running: true,
          exitCode: null,
        }),
      );
      addLog({
        source: "system",
        serial,
        message: `Mirroring ${deviceName} in ${
          PROFILES.find((option) => option.id === profile)?.name ?? profile
        } mode.`,
      });
    } catch (error) {
      addLog({ source: "system", serial, message: friendlyError(error) });
    } finally {
      setBusySerials((current) =>
        setSerialMembership(current, serial, false),
      );
    }
  };

  const stop = async () => {
    if (!selectedSerial || !selectedRunning || selectedBusy) {
      return;
    }

    const serial = selectedSerial;
    setBusySerials((current) => setSerialMembership(current, serial, true));
    try {
      await invoke("stop_scrcpy", { serial });
      addLog({ source: "system", serial, message: "Stopping mirroring…" });
    } catch (error) {
      setBusySerials((current) =>
        setSerialMembership(current, serial, false),
      );
      addLog({ source: "system", serial, message: friendlyError(error) });
    }
  };

  const launchDisabled =
    !selectedDeviceReady || selectedRunning || selectedBusy || !selectedSerial;
  const selectedProfile =
    PROFILES.find((option) => option.id === profile)?.name ?? profile;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 36 36">
              <rect x="7.5" y="4.5" width="17" height="27" rx="4" />
              <path d="M13 9h6M20 13l5 5-5 5M24.5 18H15" />
            </svg>
          </div>
          <div className="brand__copy">
            <h1>Scrcpy GO</h1>
            <p>Android gaming mirror</p>
          </div>
        </div>
        <div
          className={`session-status ${activeSessionCount ? "is-running" : ""}`}
        >
          <span className="status-dot" />
          {activeSessionCount
            ? `${activeSessionCount} session${activeSessionCount === 1 ? "" : "s"} active`
            : "Idle"}
        </div>
      </header>

      <section className="dashboard-grid" aria-label="Mirroring setup">
        <DeviceStatusCard
          snapshot={device}
          selectedSerial={selectedSerial}
          activeSessions={sessions}
          refreshing={refreshing}
          onSelect={setSelectedSerial}
          onRefresh={() => void refreshDevices()}
        />

        <ProfileSelector
          selected={profile}
          disabled={!selectedSerial || selectedRunning || selectedBusy}
          onChange={selectProfile}
        />
      </section>

      <section className="session-panel" aria-label="Launch controls">
        <div className="session-panel__copy">
          <span className="panel-kicker">Session</span>
          <div className="session-panel__heading">
            <strong>{selectedProfile}</strong>
            <span>120 FPS target</span>
          </div>
          <p>
            {selectedRunning
              ? currentPerformance
                ? `${currentPerformance.renderedFps} FPS live · ${
                    currentPerformance.skippedFrames === 0
                      ? "No skipped frames"
                      : `${currentPerformance.skippedFrames} skipped frame${
                          currentPerformance.skippedFrames === 1 ? "" : "s"
                        }`
                  } in the last second`
                : "Session active · Measuring frame delivery…"
              : launchDisabled
                ? "Select an authorized device to begin."
                : `${selectedDevice ? formatDeviceName(selectedDevice) : "Device"} is ready over USB.`}
          </p>
        </div>

        <div className="launch-actions">
          {selectedRunning && (
            <button
              className="button button--stop"
              type="button"
              onClick={() => void stop()}
              disabled={selectedBusy}
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
            <span>
              {selectedBusy
                ? "Starting…"
                : selectedRunning
                  ? "Running"
                  : "Start mirroring"}
            </span>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m7 4 6 6-6 6" />
            </svg>
          </button>
        </div>
      </section>

      <aside className="controller-bar">
        <svg viewBox="0 0 28 20" aria-hidden="true">
          <path d="M8.5 4.5h11c3 0 5.2 2.4 5.9 6.1l.6 3.1c.4 2.2-2.2 3.6-3.8 2l-2.5-2.4H8.3l-2.5 2.4c-1.6 1.6-4.2.2-3.8-2l.6-3.1c.7-3.7 2.9-6.1 5.9-6.1Z" />
          <path d="M7 9h4M9 7v4M19.5 8.5h.01M22 10.5h.01" />
        </svg>
        <p>
          <strong>Controller input</strong>
          <span>Connect before launch for Android UHID forwarding.</span>
        </p>
        <span className="controller-bar__meta">USB or Bluetooth</span>
      </aside>

      <LogPanel logs={logs} onClear={() => setLogs([])} />
    </main>
  );
}
