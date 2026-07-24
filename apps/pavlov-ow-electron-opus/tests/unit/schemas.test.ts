import { describe, it, expect } from 'vitest';
import {
  PavlovSettingsSchema,
  MinimapRectSchema,
  SessionRecordSchema,
  safeParseSettings,
  safeParseSessionRecords,
} from '../../src/shared/schemas';

describe('MinimapRectSchema', () => {
  it('accepts valid rect', () => {
    const r = MinimapRectSchema.parse({ x: 0, y: 0, width: 100, height: 100 });
    expect(r.width).toBe(100);
  });

  it('rejects negative x', () => {
    expect(() => MinimapRectSchema.parse({ x: -1, y: 0, width: 10, height: 10 })).toThrow();
  });

  it('rejects zero width', () => {
    expect(() => MinimapRectSchema.parse({ x: 0, y: 0, width: 0, height: 10 })).toThrow();
  });
});

describe('PavlovSettingsSchema', () => {
  it('fills defaults for empty object', () => {
    const settings = PavlovSettingsSchema.parse({});
    expect(settings.timeoutSeconds).toBe(5);
    expect(settings.volume).toBe(50);
    expect(settings.firstRun).toBe(true);
    expect(settings.alertModes).toEqual(['audio']);
    expect(settings.minimapRect).toBeNull();
    expect(settings.trainingMode).toBe('free');
    // Tray-resident app: autostart defaults on.
    expect(settings.launchAtStartup).toBe(true);
  });

  it('accepts full valid settings', () => {
    const full = PavlovSettingsSchema.parse({
      timeoutSeconds: 10,
      volume: 80,
      tolerancePx: 20,
      alertModes: ['visual', 'audio'],
      customSoundPath: 'C:\\sound.wav',
      minimapRect: { x: 100, y: 200, width: 300, height: 300 },
      regionName: 'LoL',
      savedRegions: [{ name: 'LoL', rect: { x: 100, y: 200, width: 300, height: 300 } }],
      hotkey: 'ctrl+m',
      irlEnabled: false,
      irlPort: 9876,
      irlWebhookUrl: '',
      firstRun: false,
      trainingMode: 'paid',
    });
    expect(full.timeoutSeconds).toBe(10);
    expect(full.trainingMode).toBe('paid');
  });

  it('rejects timeout below minimum', () => {
    expect(() => PavlovSettingsSchema.parse({ timeoutSeconds: 0.25 })).toThrow();
  });

  it('accepts timeout of 0.5 seconds', () => {
    const s = PavlovSettingsSchema.parse({ timeoutSeconds: 0.5 });
    expect(s.timeoutSeconds).toBe(0.5);
  });
});

describe('safeParseSettings', () => {
  it('returns defaults for garbage input', () => {
    const s = safeParseSettings('not an object');
    expect(s.timeoutSeconds).toBe(5);
  });

  it('returns defaults for null', () => {
    const s = safeParseSettings(null);
    expect(s.firstRun).toBe(true);
  });
});

describe('SessionRecordSchema', () => {
  it('parses a valid record', () => {
    const record = SessionRecordSchema.parse({
      timestamp: Date.now(),
      durationS: 120,
      glanceCount: 50,
      glancesPerMin: 6,
      avgGlanceDurationMs: 300,
      avgGapS: 4,
      longestGapS: 12,
      alertsTriggered: 3,
      alertFreeStreakS: 45,
      timeOnMapPct: 10,
      masScore: 72,
      regionName: 'LoL',
    });
    expect(record.masScore).toBe(72);
  });
});

describe('safeParseSessionRecords', () => {
  it('returns empty for non-array', () => {
    expect(safeParseSessionRecords('nope')).toEqual([]);
  });

  it('filters out invalid records', () => {
    const records = safeParseSessionRecords([
      {
        timestamp: 1, durationS: 60, glanceCount: 10, glancesPerMin: 5,
        avgGlanceDurationMs: 300, avgGapS: 4, longestGapS: 8,
        alertsTriggered: 1, alertFreeStreakS: 30, timeOnMapPct: 8,
        masScore: 65, regionName: 'LoL',
      },
      { broken: true },
    ]);
    expect(records).toHaveLength(1);
  });
});
