import { BrowserWindow } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';

interface OwOverlayApi {
  createWindow?: (opts: Record<string, unknown>) => { window: BrowserWindow };
}

let overwolfOverlay: OwOverlayApi | null = null;
try {
  overwolfOverlay = require('@overwolf/ow-electron').overlay ?? null;
} catch {
  // Not in ow-electron runtime; will use plain BrowserWindow fallback
}

export function isOwOverlayAvailable(): boolean {
  return overwolfOverlay != null;
}

export function createOverlayWindow(
  opts: BrowserWindowConstructorOptions & { name?: string },
): BrowserWindow {
  if (overwolfOverlay && typeof overwolfOverlay.createWindow === 'function') {
    const result = overwolfOverlay.createWindow({
      name: opts.name ?? 'overlay',
      ...opts,
    });
    return result.window;
  }
  return new BrowserWindow({ ...opts, alwaysOnTop: true });
}
