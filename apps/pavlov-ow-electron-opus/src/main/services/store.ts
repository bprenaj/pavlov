import { randomUUID } from 'crypto';
import * as path from 'path';
import Store from 'electron-store';
import { safeParseSettings, safeParseSessionRecords } from '../../shared/schemas';
import { APP_DATA_DIR } from '../../shared/constants';
import type { MapSenseSettings, SessionRecord } from '../../shared/types';

// Pin storage to %APPDATA%/Pavlov (APP_DATA_DIR) instead of letting
// electron-store derive it from the app name. This store is constructed at
// import time, before app.setName runs, and the app now reports 'MapSense';
// without this pin the config would move to %APPDATA%/MapSense and every
// existing install would look factory-fresh. Mirrors migration.ts's resolver.
function storeCwd(): string {
  const base = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
  return path.join(base, APP_DATA_DIR);
}

// The config filename stays 'pavlov-config' for the same continuity reason:
// it is the file existing installs already have on disk.
const store = new Store({
  name: 'pavlov-config',
  cwd: storeCwd(),
  defaults: {
    settings: {},
    history: [],
  },
});

export function loadSettings(): MapSenseSettings {
  return safeParseSettings(store.get('settings'));
}

export function saveSettings(settings: MapSenseSettings): void {
  store.set('settings', settings);
}

export function patchSettings(patch: Partial<MapSenseSettings>): MapSenseSettings {
  const current = loadSettings();
  const merged = { ...current, ...patch };
  saveSettings(merged);
  return merged;
}

export function loadHistory(): SessionRecord[] {
  return safeParseSessionRecords(store.get('history'));
}

export function addSessionRecord(record: SessionRecord): void {
  const records = loadHistory();
  records.push(record);
  store.set('history', records);
}

export function clearHistory(): void {
  store.set('history', []);
}

export function loadEntitlementTier(): string | null {
  const value = store.get('entitlementTier');
  return typeof value === 'string' ? value : null;
}

export function saveEntitlementTier(tier: string): void {
  store.set('entitlementTier', tier);
}

/**
 * Stable anonymous install id (UUID v4), generated once on first run. Used as
 * the analytics distinct-id. Not tied to any personal data.
 */
export function getInstallId(): string {
  const existing = store.get('installId');
  if (typeof existing === 'string' && existing.length > 0) return existing;
  const id = randomUUID();
  store.set('installId', id);
  return id;
}

export function loadLastVersion(): string | null {
  const value = store.get('lastVersion');
  return typeof value === 'string' ? value : null;
}

export function saveLastVersion(version: string): void {
  store.set('lastVersion', version);
}

export function getStorePath(): string {
  return store.path;
}
