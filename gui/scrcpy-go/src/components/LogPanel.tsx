import { useEffect, useRef } from "react";
import type { LogEvent } from "../types";

interface LogPanelProps {
  logs: readonly LogEvent[];
  onClear: () => void;
}

export function LogPanel({ logs, onClear }: LogPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({
      top: bodyRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [logs]);

  return (
    <section className="log-panel">
      <header className="log-panel__header">
        <div>Activity</div>
        <button type="button" onClick={onClear} disabled={logs.length === 0}>
          Clear
        </button>
      </header>
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
              <p>{entry.message}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
