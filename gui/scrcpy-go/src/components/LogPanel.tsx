import { useEffect, useRef } from "react";
import type { LogEvent } from "../types";

interface LogPanelProps {
  logs: readonly LogEvent[];
  onClear: () => void;
}

export function LogPanel({ logs, onClear }: LogPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const latest = logs.at(-1)?.message ?? "No activity yet.";

  useEffect(() => {
    bodyRef.current?.scrollTo({
      top: bodyRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [logs]);

  return (
    <details className="activity-panel">
      <summary>
        <span className="activity-panel__chevron" aria-hidden="true">
          <svg viewBox="0 0 16 16">
            <path d="m5.5 3 5 5-5 5" />
          </svg>
        </span>
        <span className="activity-panel__title">Activity</span>
        <span className="activity-panel__latest">{latest}</span>
        <span className="activity-panel__count">
          {logs.length} {logs.length === 1 ? "event" : "events"}
        </span>
      </summary>
      <div className="activity-panel__content">
        <div className="activity-panel__toolbar">
          <span>Session diagnostics</span>
          <button type="button" onClick={onClear} disabled={logs.length === 0}>
            Clear
          </button>
        </div>
        <div className="log-panel__body" ref={bodyRef} aria-live="polite">
          {logs.length === 0 ? (
            <p className="log-empty">Launch activity will appear here.</p>
          ) : (
            logs.map((entry, index) => (
              <div
                className={`log-line log-line--${entry.source}`}
                key={`${index}-${entry.message}`}
              >
                <span>{entry.source === "system" ? "GO" : "SC"}</span>
                <p>
                  {entry.serial && (
                    <small className="log-line__device">{entry.serial}</small>
                  )}
                  {entry.message}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </details>
  );
}
