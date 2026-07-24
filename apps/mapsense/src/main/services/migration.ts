import * as fs from 'fs';
import * as path from 'path';
import { LEGACY_DATA_DIR, APP_DATA_DIR } from '../../shared/constants';
import { safeParseSettings, safeParseSessionRecords } from '../../shared/schemas';
import type { MapSenseSettings, SessionRecord } from '../../shared/types';

function legacyDir(): string {
  const base = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
  return path.join(base, LEGACY_DATA_DIR);
}

function newDir(): string {
  const base = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
  return path.join(base, APP_DATA_DIR);
}

function readJsonSafe(filePath: string): unknown {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * One-time migration from the retired 1.0.x brand dir. Those builds stored
 * everything (settings, history, entitlement, install id) in a single
 * electron-store file under the old product name's userData dir; copy it into
 * the new location once, before the store is first read. The old dir is
 * removed by the uninstaller's legacy cleanup.
 */
export function migrateRetiredBrandData(): boolean {
  const base =
    process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
  const oldFile = path.join(base, 'Pavlov', 'pavlov-config.json');
  const newFile = path.join(newDir(), 'mapsense-config.json');
  try {
    if (fs.existsSync(newFile) || !fs.existsSync(oldFile)) return false;
    fs.mkdirSync(newDir(), { recursive: true });
    fs.copyFileSync(oldFile, newFile);
    return true;
  } catch {
    return false; // fresh defaults beat a crashed startup
  }
}

export interface MigrationResult {
  migrated: boolean;
  settingsFound: boolean;
  historyFound: boolean;
  recordCount: number;
}

export function migrateLegacyData(): MigrationResult {
  const result: MigrationResult = {
    migrated: false,
    settingsFound: false,
    historyFound: false,
    recordCount: 0,
  };

  const markerPath = path.join(newDir(), '.migrated');
  if (fs.existsSync(markerPath)) return result;

  const legacySettingsPath = path.join(legacyDir(), 'settings.json');
  const legacyHistoryPath = path.join(legacyDir(), 'history.json');

  const rawSettings = readJsonSafe(legacySettingsPath);
  if (rawSettings) {
    result.settingsFound = true;
  }

  const rawHistory = readJsonSafe(legacyHistoryPath);
  if (rawHistory) {
    result.historyFound = true;
  }

  if (!result.settingsFound && !result.historyFound) return result;

  fs.mkdirSync(newDir(), { recursive: true });

  if (rawSettings) {
    const settings = mapLegacySettings(rawSettings as Record<string, unknown>);
    fs.writeFileSync(
      path.join(newDir(), 'settings-migrated.json'),
      JSON.stringify(settings, null, 2),
    );
  }

  if (rawHistory) {
    const records = mapLegacyHistory(rawHistory);
    result.recordCount = records.length;
    fs.writeFileSync(
      path.join(newDir(), 'history-migrated.json'),
      JSON.stringify(records, null, 2),
    );
  }

  fs.writeFileSync(markerPath, new Date().toISOString());
  result.migrated = true;
  return result;
}

function mapLegacySettings(raw: Record<string, unknown>): MapSenseSettings {
  const mapped: Record<string, unknown> = {};

  if (typeof raw.timeout_seconds === 'number') mapped.timeoutSeconds = raw.timeout_seconds;
  if (typeof raw.volume === 'number') mapped.volume = raw.volume;
  if (typeof raw.gaze_tolerance === 'number') mapped.tolerancePx = raw.gaze_tolerance;
  if (typeof raw.alert_mode === 'string') {
    mapped.alertModes = [raw.alert_mode === 'both' ? 'audio' : raw.alert_mode];
  }
  if (typeof raw.custom_sound_path === 'string') mapped.customSoundPath = raw.custom_sound_path;
  if (raw.minimap_rect && typeof raw.minimap_rect === 'object') {
    const r = raw.minimap_rect as Record<string, number>;
    mapped.minimapRect = { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  if (typeof raw.region_name === 'string') mapped.regionName = raw.region_name;
  if (typeof raw.hotkey === 'string') mapped.hotkey = raw.hotkey;

  mapped.firstRun = false;
  return safeParseSettings(mapped);
}

function mapLegacyHistory(raw: unknown): SessionRecord[] {
  if (!Array.isArray(raw)) return [];
  return safeParseSessionRecords(
    raw.map((r: Record<string, unknown>) => ({
      timestamp: r.timestamp,
      durationS: r.duration_s,
      glanceCount: r.glance_count,
      glancesPerMin: r.glances_per_min,
      avgGlanceDurationMs: r.avg_glance_duration_ms,
      avgGapS: r.avg_gap_s,
      longestGapS: r.longest_gap_s,
      alertsTriggered: r.alerts_triggered,
      alertFreeStreakS: r.alert_free_streak_s,
      timeOnMapPct: r.time_on_map_pct,
      masScore: r.mas_score,
      regionName: r.region_name || '',
    })),
  );
}

export function getLegacySettings(): MapSenseSettings | null {
  const raw = readJsonSafe(path.join(legacyDir(), 'settings.json'));
  if (!raw) return null;
  return mapLegacySettings(raw as Record<string, unknown>);
}

export function getLegacyHistory(): SessionRecord[] {
  const raw = readJsonSafe(path.join(legacyDir(), 'history.json'));
  if (!raw) return [];
  return mapLegacyHistory(raw);
}
