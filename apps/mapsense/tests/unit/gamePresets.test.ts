import { describe, it, expect } from 'vitest';
import {
  PRESETS,
  PRESET_ORDER,
  getPreset,
  presetKeys,
  presetToRect,
  cornerLabel,
} from '../../src/shared/gamePresets';

describe('PRESETS', () => {
  it('contains all keys in PRESET_ORDER', () => {
    for (const key of PRESET_ORDER) {
      expect(PRESETS[key]).toBeDefined();
    }
  });

  it('has ratio values in 0-1 range', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(preset.minimapX).toBeGreaterThanOrEqual(0);
      expect(preset.minimapX).toBeLessThanOrEqual(1);
      expect(preset.minimapY).toBeGreaterThanOrEqual(0);
      expect(preset.minimapY).toBeLessThanOrEqual(1);
      expect(preset.minimapW).toBeGreaterThan(0);
      expect(preset.minimapW).toBeLessThanOrEqual(1);
      expect(preset.minimapH).toBeGreaterThan(0);
      expect(preset.minimapH).toBeLessThanOrEqual(1);
    }
  });

  it('each preset has a non-empty name', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(preset.name.length).toBeGreaterThan(0);
    }
  });
});

describe('getPreset', () => {
  it('returns the correct preset for a valid key', () => {
    expect(getPreset('lol')?.name).toBe('League of Legends');
  });

  it('returns undefined for an unknown key', () => {
    expect(getPreset('nonexistent')).toBeUndefined();
  });
});

describe('presetKeys', () => {
  it('returns a copy of PRESET_ORDER', () => {
    const keys = presetKeys();
    expect(keys).toEqual([...PRESET_ORDER]);
    keys.push('test');
    expect(presetKeys()).not.toContain('test');
  });
});

describe('presetToRect', () => {
  it('converts LoL preset to pixel rect at 1920x1080', () => {
    const rect = presetToRect(PRESETS.lol, 1920, 1080);
    expect(rect.x).toBeGreaterThan(1500);
    expect(rect.y).toBeGreaterThan(800);
    expect(rect.width).toBeGreaterThan(200);
    expect(rect.height).toBeGreaterThan(150);
  });
});

describe('cornerLabel', () => {
  it('labels LoL as Bottom-right', () => {
    expect(cornerLabel(PRESETS.lol)).toBe('Bottom-right');
  });

  it('labels Valorant as Top-left', () => {
    expect(cornerLabel(PRESETS.valorant)).toBe('Top-left');
  });

  it('labels Dota 2 as Bottom-left', () => {
    expect(cornerLabel(PRESETS.dota2)).toBe('Bottom-left');
  });
});
