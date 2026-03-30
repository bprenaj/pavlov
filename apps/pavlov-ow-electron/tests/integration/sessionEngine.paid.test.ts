import { afterEach, vi } from "vitest";
import { SessionEngine } from "../../src/main/services/sessionEngine";
import { DEFAULT_SETTINGS } from "../../src/shared/models/types";

afterEach(() => {
  vi.useRealTimers();
});

describe("SessionEngine paid mode", () => {
  test("enters alert when player ignores minimap and clears on gaze return", () => {
    vi.useFakeTimers();

    const engine = new SessionEngine(
      {
        ...DEFAULT_SETTINGS,
        timeoutSeconds: 0.25,
        minimapRect: {
          x: 1700,
          y: 880,
          width: 220,
          height: 180
        }
      },
      1920,
      1080
    );
    engine.setEntitlement("paid");

    const alertEvents: boolean[] = [];
    engine.on("alert", (active) => alertEvents.push(active));

    engine.start("paid");

    vi.advanceTimersByTime(400);
    expect(alertEvents.at(-1)).toBe(true);

    engine.onGaze({
      x: 1800,
      y: 950,
      confidence: 3,
      timestamp: Date.now() / 1000,
      isTracking: true
    });
    expect(alertEvents.at(-1)).toBe(false);

    engine.stop();
  });

  test("falls back to free mode when paid entitlement is unavailable", () => {
    const engine = new SessionEngine(DEFAULT_SETTINGS, 1920, 1080);
    engine.setEntitlement("free");

    let lastMode = "";
    engine.on("state", (state) => {
      lastMode = state.mode;
    });
    engine.start("paid");
    engine.stop();

    expect(lastMode).toBe("free");
  });
});
