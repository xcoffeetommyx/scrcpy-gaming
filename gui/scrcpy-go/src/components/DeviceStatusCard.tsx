import type { DeviceSnapshot } from "../types";
import {
  formatDeviceName,
  formatDeviceOption,
  isReadyDevice,
} from "../devices";

interface DeviceStatusCardProps {
  snapshot: DeviceSnapshot;
  selectedSerial: string | null;
  activeSessions: ReadonlyMap<string, number>;
  refreshing: boolean;
  onSelect: (serial: string) => void;
  onRefresh: () => void;
}

const STATUS_LABELS: Record<DeviceSnapshot["kind"], string> = {
  noDevice: "Waiting",
  connected: "Ready",
  unauthorized: "Action needed",
  unavailable: "Unavailable",
  adbError: "Backend error",
};

export function DeviceStatusCard({
  snapshot,
  selectedSerial,
  activeSessions,
  refreshing,
  onSelect,
  onRefresh,
}: DeviceStatusCardProps) {
  const selectedDevice = snapshot.devices.find(
    (device) => device.serial === selectedSerial,
  );
  const displayDevice =
    selectedDevice ??
    (snapshot.devices.length === 1 ? snapshot.devices[0] : undefined);
  const deviceName = displayDevice && formatDeviceName(displayDevice);
  const showPicker = snapshot.devices.length > 1;
  const statusLabel =
    snapshot.kind === "connected" && snapshot.readyCount > 1
      ? `${snapshot.readyCount} ready`
      : STATUS_LABELS[snapshot.kind];

  return (
    <section className={`device-card state-${snapshot.kind}`} aria-live="polite">
      <div className="device-card__content">
        <div className="device-card__icon" aria-hidden="true">
          <span className="phone-speaker" />
          <span className="phone-screen" />
        </div>

        <div className="device-card__copy">
          <h2>{deviceName || snapshot.title}</h2>
          <p>{snapshot.message}</p>
          {showPicker && (
            <label className="device-picker">
              <span>Mirror device</span>
              <select
                value={selectedSerial ?? ""}
                onChange={(event) => onSelect(event.target.value)}
                disabled={snapshot.readyCount === 0}
                aria-label="Device to mirror"
              >
                {!selectedSerial && (
                  <option value="" disabled>
                    Select a ready device
                  </option>
                )}
                {snapshot.devices.map((device) => (
                  <option
                    key={device.serial}
                    value={device.serial}
                    disabled={!isReadyDevice(device)}
                  >
                    {formatDeviceOption(device)}
                    {activeSessions.has(device.serial) ? " • Active" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="device-state">
          <span className="status-dot" />
          {statusLabel}
        </div>

        <button
          className="icon-button"
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh device connection"
          title="Refresh device connection"
        >
          <svg
            className={refreshing ? "is-spinning" : ""}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M20 7v5h-5M4 17v-5h5" />
            <path d="M6.1 8.1A7 7 0 0 1 18.7 7M17.9 15.9A7 7 0 0 1 5.3 17" />
          </svg>
        </button>
      </div>
    </section>
  );
}
