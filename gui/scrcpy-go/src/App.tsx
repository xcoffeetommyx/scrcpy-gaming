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
        <div
          className={`session-pill ${activeSessionCount ? "is-running" : ""}`}
        >
          <span />
          {activeSessionCount
            ? `${activeSessionCount} session${activeSessionCount === 1 ? "" : "s"} active`
            : "Ready to play"}
        </div>
      </header>

      <section className="workspace">
        <div className="section-title">
          <h2>Device</h2>
          <p>USB debugging required</p>
        </div>

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

        <section className="launch-zone" aria-label="Launch controls">
          <div className="launch-summary">
            <span>
              {selectedRunning
                ? "Mirroring now"
                : launchDisabled
                  ? "Before you start"
                  : "Ready to play"}
            </span>
            <strong>{selectedProfile} profile</strong>
            <p>
              {selectedRunning
                ? currentPerformance
                  ? `${currentPerformance.renderedFps} FPS live · ${
                      currentPerformance.skippedFrames === 0
                        ? "no skipped frames"
                        : `${currentPerformance.skippedFrames} skipped frame${
                            currentPerformance.skippedFrames === 1 ? "" : "s"
                          }`
                    } in the last second`
                  : "Measuring frame delivery…"
                : launchDisabled
                  ? "Select an authorized device to continue."
                  : "Your device and controller setup are ready."}
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
              <span className="button__label">
                {selectedBusy
                  ? "Working…"
                  : selectedRunning
                    ? "Running"
                    : "GO"}
              </span>
              <span className="button__hint">
                {selectedRunning ? "Session active" : "Start mirroring"}
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
