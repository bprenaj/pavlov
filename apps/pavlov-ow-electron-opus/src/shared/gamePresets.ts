import type { GamePreset } from './types';

export const PRESETS: Record<string, GamePreset> = {
  lol: {
    name: 'League of Legends',
    minimapX: 0.8385,
    minimapY: 0.7963,
    minimapW: 0.1615,
    minimapH: 0.2037,
    description: 'Default minimap, bottom-right corner',
  },
  dota2: {
    name: 'Dota 2',
    minimapX: 0.0,
    minimapY: 0.7778,
    minimapW: 0.1406,
    minimapH: 0.2222,
    description: 'Default minimap, bottom-left corner',
  },
  sc2: {
    name: 'StarCraft II',
    minimapX: 0.0,
    minimapY: 0.7639,
    minimapW: 0.1302,
    minimapH: 0.2361,
    description: 'Default minimap, bottom-left corner',
  },
  valorant: {
    name: 'Valorant',
    minimapX: 0.0,
    minimapY: 0.0,
    minimapW: 0.1458,
    minimapH: 0.2593,
    description: 'Radar, top-left corner',
  },
  cs2: {
    name: 'Counter-Strike 2',
    minimapX: 0.0,
    minimapY: 0.0,
    minimapW: 0.151,
    minimapH: 0.2685,
    description: 'Radar, top-left corner',
  },
  overwatch: {
    name: 'Overwatch 2',
    minimapX: 0.0,
    minimapY: 0.68,
    minimapW: 0.12,
    minimapH: 0.2,
    description: 'Team/objective area, bottom-left',
  },
  smite: {
    name: 'Smite',
    minimapX: 0.8438,
    minimapY: 0.7407,
    minimapW: 0.1563,
    minimapH: 0.2593,
    description: 'Default minimap, bottom-right corner',
  },
  custom: {
    name: 'Custom',
    minimapX: 0.75,
    minimapY: 0.75,
    minimapW: 0.2,
    minimapH: 0.2,
    description: 'User-defined region',
  },
};

export const PRESET_ORDER = ['lol', 'dota2', 'sc2', 'valorant', 'cs2', 'overwatch', 'smite', 'custom'] as const;

export function getPreset(key: string): GamePreset | undefined {
  return PRESETS[key];
}

export function presetKeys(): string[] {
  return [...PRESET_ORDER];
}

export function presetToRect(preset: GamePreset, screenW: number, screenH: number) {
  return {
    x: Math.round(preset.minimapX * screenW),
    y: Math.round(preset.minimapY * screenH),
    width: Math.round(preset.minimapW * screenW),
    height: Math.round(preset.minimapH * screenH),
  };
}

export function cornerLabel(preset: GamePreset): string {
  const v = preset.minimapY > 0.5 ? 'Bottom' : 'Top';
  const h = preset.minimapX > 0.5 ? 'right' : 'left';
  return `${v}-${h}`;
}
