import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { AppStoreService } from "../../src/main/services/appStore";
import { DEFAULT_SETTINGS } from "../../src/shared/models/types";

describe("AppStoreService", () => {
  test("persists settings and sessions", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "pavlov-store-"));
    try {
      const store = new AppStoreService(tempDir);
      const patched = await store.patchSettings({
        timeoutSeconds: 7,
        regionName: "Valorant Radar"
      });
      expect(patched.timeoutSeconds).toBe(7);

      await store.appendSession({
        timestamp: Date.now() / 1000,
        duration_s: 120,
        glance_count: 10,
        glances_per_min: 5,
        avg_glance_duration_ms: 250,
        avg_gap_s: 8,
        longest_gap_s: 12,
        alerts_triggered: 3,
        alert_free_streak_s: 40,
        time_on_map_pct: 9.2,
        mas_score: 63.2,
        region_name: "Valorant Radar",
        mode: "paid"
      });

      const storeReloaded = new AppStoreService(tempDir);
      const reloadedSettings = await storeReloaded.loadSettings();
      const sessions = await storeReloaded.loadSessions();

      expect(reloadedSettings.timeoutSeconds).toBe(7);
      expect(reloadedSettings.regionName).toBe("Valorant Radar");
      expect(sessions).toHaveLength(1);
      expect(sessions[0].mode).toBe("paid");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("falls back to defaults on missing data", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "pavlov-store-"));
    try {
      const store = new AppStoreService(tempDir);
      const settings = await store.loadSettings();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
