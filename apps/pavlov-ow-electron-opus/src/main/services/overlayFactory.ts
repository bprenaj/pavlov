import { BrowserWindow } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';

let overwolfOverlay: any = null;
try {
  overwolfOverlay = require('@overwolf/ow-electron').overlay;
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
    return result.window as BrowserWindow;
  }
  return new BrowserWindow({ ...opts, alwaysOnTop: true });
}
