import Store from 'electron-store';
import { safeParseSettings, safeParseSessionRecords } from '../../shared/schemas';
import type { PavlovSettings, SessionRecord } from '../../shared/types';

const store = new Store({
  name: 'pavlov-config',
  defaults: {
    settings: {},
    history: [],
  },
});

export function loadSettings(): PavlovSettings {
  return safeParseSettings(store.get('settings'));
}

export function saveSettings(settings: PavlovSettings): void {
  store.set('settings', settings);
}

export function patchSettings(patch: Partial<PavlovSettings>): PavlovSettings {
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

export function getStorePath(): string {
  return store.path;
}
