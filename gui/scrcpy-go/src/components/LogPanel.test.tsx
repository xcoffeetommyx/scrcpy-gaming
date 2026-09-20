import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LogPanel } from "./LogPanel";

describe("activity presentation", () => {
  it("keeps the latest event discoverable while using a semantic log", () => {
    const markup = renderToStaticMarkup(
      <LogPanel
        logs={[{ source: "system", message: "Mirroring started." }]}
        onClear={() => {}}
      />,
    );

    expect(markup).toContain("<summary>");
    expect(markup).toContain("Mirroring started.");
    expect(markup).toContain("1 event");
    expect(markup).toContain('role="log" aria-live="polite" aria-relevant="additions"');
  });
});
