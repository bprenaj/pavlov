import { afterEach, vi } from "vitest";
import { SessionEngine } from "../../src/main/services/sessionEngine";
import { DEFAULT_SETTINGS } from "../../src/shared/models/types";

afterEach(() => {
  vi.useRealTimers();
});

describe("SessionEngine free mode", () => {
  test("fires periodic alerts without Beam gaze", () => {
    vi.useFakeTimers();

    const engine = new SessionEngine(
      {
        ...DEFAULT_SETTINGS,
        timeoutSeconds: 0.1
      },
      1920,
      1080
    );
    engine.setEntitlement("free");

    const alertEvents: boolean[] = [];
    engine.on("alert", (active) => alertEvents.push(active));

    engine.start("free");
    vi.advanceTimersByTime(1000);
    engine.stop();

    expect(alertEvents.some((event) => event)).toBe(true);
  });
});
