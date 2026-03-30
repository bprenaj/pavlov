import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_SETTINGS } from "../../shared/models/types";
import type { AppSettings, SessionRecord } from "../../shared/models/types";
import {
  legacyHistorySchema,
  legacySettingsSchema
} from "../../shared/models/schemas";
import type { AppStoreService } from "./appStore";

export interface MigrationResult {
  migrated: boolean;
  importedSessions: number;
}

export async function migrateLegacyMapSenseData(
  appStore: AppStoreService
): Promise<MigrationResult> {
  const meta = await appStore.getMeta();
  if (meta.hasMigratedLegacyData) {
    return { migrated: false, importedSessions: 0 };
  }

  const appData = process.env.APPDATA || "";
  const legacyBase = path.join(appData, "MapSense");
  const settingsFile = path.join(legacyBase, "settings.json");
  const historyFile = path.join(legacyBase, "history.json");

  let migratedAny = false;
  let importedSessions = 0;

  const legacySettings = await readJsonIfPresent(settingsFile);
  if (legacySettings) {
    const parsed = legacySettingsSchema.safeParse(legacySettings);
    if (parsed.success) {
      const mapped = mapLegacySettings(parsed.data);
      await appStore.saveSettings(mapped);
      migratedAny = true;
    }
  }

  const legacyHistory = await readJsonIfPresent(historyFile);
  if (legacyHistory) {
    const parsed = legacyHistorySchema.safeParse(legacyHistory);
    if (parsed.success) {
      for (const row of parsed.data) {
        const record: SessionRecord = {
          timestamp: row.timestamp ?? Date.now() / 1000,
          duration_s: row.duration_s ?? 0,
          glance_count: row.glance_count ?? 0,
          glances_per_min: row.glances_per_min ?? 0,
          avg_glance_duration_ms: row.avg_glance_duration_ms ?? 0,
          avg_gap_s: row.avg_gap_s ?? 0,
          longest_gap_s: row.longest_gap_s ?? 0,
          alerts_triggered: row.alerts_triggered ?? 0,
          alert_free_streak_s: row.alert_free_streak_s ?? 0,
          time_on_map_pct: row.time_on_map_pct ?? 0,
          mas_score: row.mas_score ?? 0,
          region_name: row.region_name ?? "",
          mode: "paid"
        };
        await appStore.appendSession(record);
        importedSessions += 1;
      }
      migratedAny = migratedAny || importedSessions > 0;
    }
  }

  await appStore.markMigrationDone();
  return {
    migrated: migratedAny,
    importedSessions
  };
}

export function mapLegacySettings(legacy: {
  timeout_seconds?: number;
  volume?: number;
  gaze_tolerance?: number;
  alert_mode?: { audio?: boolean; visual?: boolean };
  minimap_rect?: { x?: number; y?: number; width?: number; height?: number };
  region_name?: string;
  first_run?: boolean;
}): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    timeoutSeconds: legacy.timeout_seconds ?? DEFAULT_SETTINGS.timeoutSeconds,
    volume: legacy.volume ?? DEFAULT_SETTINGS.volume,
    gazeTolerance: legacy.gaze_tolerance ?? DEFAULT_SETTINGS.gazeTolerance,
    alertMode: {
      audio: legacy.alert_mode?.audio ?? DEFAULT_SETTINGS.alertMode.audio,
      visual: legacy.alert_mode?.visual ?? DEFAULT_SETTINGS.alertMode.visual
    },
    minimapRect: {
      x: legacy.minimap_rect?.x ?? DEFAULT_SETTINGS.minimapRect.x,
      y: legacy.minimap_rect?.y ?? DEFAULT_SETTINGS.minimapRect.y,
      width: legacy.minimap_rect?.width ?? DEFAULT_SETTINGS.minimapRect.width,
      height:
        legacy.minimap_rect?.height ?? DEFAULT_SETTINGS.minimapRect.height
    },
    regionName: legacy.region_name ?? DEFAULT_SETTINGS.regionName,
    firstRun: legacy.first_run ?? DEFAULT_SETTINGS.firstRun
  };
}

async function readJsonIfPresent(filePath: string): Promise<unknown | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
