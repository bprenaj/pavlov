import { mapLegacySettings } from "../../src/main/services/legacyMigration";

describe("legacy settings migration mapping", () => {
  test("maps snake_case fields into app settings", () => {
    const mapped = mapLegacySettings({
      timeout_seconds: 4.5,
      volume: 80,
      gaze_tolerance: 12,
      alert_mode: { audio: false, visual: true },
      minimap_rect: { x: 10, y: 20, width: 160, height: 140 },
      region_name: "LoL Bottom Right",
      first_run: false
    });

    expect(mapped.timeoutSeconds).toBe(4.5);
    expect(mapped.volume).toBe(80);
    expect(mapped.gazeTolerance).toBe(12);
    expect(mapped.alertMode.audio).toBe(false);
    expect(mapped.minimapRect.width).toBe(160);
    expect(mapped.regionName).toBe("LoL Bottom Right");
    expect(mapped.firstRun).toBe(false);
  });
});
