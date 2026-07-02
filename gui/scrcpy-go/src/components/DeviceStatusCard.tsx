import type { DeviceSnapshot } from "../types";

interface DeviceStatusCardProps {
  snapshot: DeviceSnapshot;
  refreshing: boolean;
  onRefresh: () => void;
}

const STATUS_LABELS: Record<DeviceSnapshot["kind"], string> = {
  noDevice: "Waiting",
  connected: "Ready",
  unauthorized: "Action needed",
  multipleDevices: "Choose one",
  unavailable: "Unavailable",
  adbError: "Backend error",
};

export function DeviceStatusCard({
  snapshot,
  refreshing,
  onRefresh,
}: DeviceStatusCardProps) {
  const deviceName = snapshot.model?.replaceAll("_", " ");

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
        </div>

        <div className="device-state">
          <span className="status-dot" />
          {STATUS_LABELS[snapshot.kind]}
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
