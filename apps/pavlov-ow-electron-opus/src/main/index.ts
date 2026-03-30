import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  screen,
  globalShortcut,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { IPC } from './ipc';

// #region agent log
const DBG_LOG = path.join(__dirname, '..', '..', '..', '..', 'debug-293fda.log');
function dbg(loc: string, msg: string, data: Record<string, unknown> = {}, hyp = 'H1') {
  try { fs.appendFileSync(DBG_LOG, JSON.stringify({sessionId:'293fda',location:loc,message:msg,data,timestamp:Date.now(),hypothesisId:hyp}) + '\n'); } catch(_){}
}
// #endregion
import { loadSettings, patchSettings, loadHistory, addSessionRecord, clearHistory } from './services/store';
import { getEntitlement, setEntitlement } from './services/entitlement';
import { migrateLegacyData } from './services/migration';
import { BeamBridge } from './services/beamBridge';
import { SessionEngine } from './services/sessionEngine';
import { AlertManager } from './services/alertManager';
import { IrlWebhook } from './services/irlWebhook';
import { TrayManager } from './services/tray';
import { createOverlayWindow } from './services/overlayFactory';
import type { MinimapRect, PavlovSettings } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let alertOverlayWindow: BrowserWindow | null = null;
let regionOverlayWindow: BrowserWindow | null = null;
let regionResolve: ((rect: MinimapRect | null) => void) | null = null;

const beamBridge = new BeamBridge();
const sessionEngine = new SessionEngine();
const irlWebhook = new IrlWebhook();
const trayManager = new TrayManager();

const alertManager = new AlertManager({
  playAudio: (_soundPath, _volume) => {
    mainWindow?.webContents.send('pavlov:playAlert', { soundPath: _soundPath, volume: _volume });
  },
  stopAudio: () => {
    mainWindow?.webContents.send('pavlov:stopAlert');
  },
  showVisualAlert: (show) => {
    alertOverlayWindow?.webContents.send(IPC.ALERT_STATE, show);
    if (show) {
      alertOverlayWindow?.showInactive();
    } else {
      alertOverlayWindow?.hide();
    }
  },
  onIrlAlert: (active) => {
    if (active) irlWebhook.onAlertStart();
    else irlWebhook.onAlertStop();
  },
});

function getPreloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

function getOverlayPreloadPath(): string {
  return path.join(__dirname, 'overlayPreload.js');
}

function getRendererPath(file: string): string {
  return path.join(__dirname, '..', 'renderer', file);
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0B1120',
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(getRendererPath('index.html'));

  win.once('ready-to-show', () => {
    win.show();
  });

  win.on('close', (e) => {
    e.preventDefault();
    win.hide();
  });

  return win;
}

function createAlertOverlay(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const win = createOverlayWindow({
    name: 'pavlov-alert',
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: getOverlayPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setIgnoreMouseEvents(true);
  win.loadFile(getRendererPath('alert-overlay.html'));
  return win;
}

function forceCloseRegionOverlay(): void {
  if (regionResolve) { regionResolve(null); regionResolve = null; }
  if (regionOverlayWindow && !regionOverlayWindow.isDestroyed()) {
    regionOverlayWindow.close();
  }
  regionOverlayWindow = null;
  globalShortcut.unregister('Escape');
}

function createRegionOverlay(): Promise<MinimapRect | null> {
  return new Promise((resolve) => {
    regionResolve = resolve;
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    const preloadPath = getOverlayPreloadPath();

    // #region agent log
    dbg('index.ts:createRegionOverlay','Creating region overlay',{width,height,preloadPath,preloadExists:fs.existsSync(preloadPath)},'H2');
    // #endregion

    regionOverlayWindow = createOverlayWindow({
      name: 'pavlov-region',
      width,
      height,
      x: 0,
      y: 0,
      transparent: true,
      frame: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    regionOverlayWindow.loadFile(getRendererPath('region-overlay.html'));

    // SAFETY LAYER 1: Intercept keyboard at Chromium level (main process).
    // Works even if renderer JS is completely broken or never loaded.
    regionOverlayWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      // #region agent log
      dbg('index.ts:before-input-event','Key intercepted at Chromium level',{key:input.key,type:input.type},'H3');
      // #endregion
      if (input.key === 'Escape') {
        event.preventDefault();
        forceCloseRegionOverlay();
      } else if (input.key === 'Enter') {
        event.preventDefault();
        regionOverlayWindow?.webContents.executeJavaScript('window.__pendingRect || null').then((rect: unknown) => {
          if (rect && typeof rect === 'object' && typeof (rect as any).x === 'number' && typeof (rect as any).width === 'number') {
            if (regionResolve) { regionResolve(rect as MinimapRect); regionResolve = null; }
            regionOverlayWindow?.close();
          }
        }).catch(() => {});
      }
    });

    // SAFETY LAYER 2: Auto-close after 60 seconds. Overlay cannot exist forever.
    const safetyTimeout = setTimeout(() => {
      // #region agent log
      dbg('index.ts:safetyTimeout','60s timeout - force closing overlay',{},'H5');
      // #endregion
      forceCloseRegionOverlay();
    }, 60_000);

    // SAFETY LAYER 3: Global shortcut for Escape works even if window has no focus.
    globalShortcut.register('Escape', () => {
      // #region agent log
      dbg('index.ts:globalShortcut-Escape','Global Escape pressed',{},'H3');
      // #endregion
      forceCloseRegionOverlay();
    });

    regionOverlayWindow.once('ready-to-show', () => {
      // #region agent log
      dbg('index.ts:ready-to-show','ready-to-show fired, calling show+focus',{windowId:regionOverlayWindow?.id},'H3');
      // #endregion
      regionOverlayWindow?.show();
      regionOverlayWindow?.focus();
      regionOverlayWindow?.webContents.send(IPC.REGION_INIT, {
        screenWidth: width,
        screenHeight: height,
      });
    });

    // #region agent log
    regionOverlayWindow.webContents.on('did-finish-load', () => {
      dbg('index.ts:did-finish-load','Overlay page finished loading',{url:regionOverlayWindow?.webContents.getURL()},'H1');
    });
    regionOverlayWindow.webContents.on('console-message', (_e, _level, msg) => {
      dbg('index.ts:console-message','Renderer console',{msg},'H1');
    });
    // #endregion

    regionOverlayWindow.on('closed', () => {
      clearTimeout(safetyTimeout);
      globalShortcut.unregister('Escape');
      regionOverlayWindow = null;
      if (regionResolve) {
        regionResolve(null);
        regionResolve = null;
      }
    });
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.GET_BOOTSTRAP, () => ({
    settings: loadSettings(),
    entitlement: getEntitlement(),
    beamStatus: beamBridge.getStatus(),
    history: loadHistory(),
  }));

  ipcMain.handle(IPC.PATCH_SETTINGS, (_e, patch: Partial<PavlovSettings>) => {
    const updated = patchSettings(patch);
    applySettings(updated);
    return updated;
  });

  ipcMain.handle(IPC.START_TRAINING, () => {
    const settings = loadSettings();
    sessionEngine.configure({
      mode: settings.trainingMode,
      timeoutS: settings.timeoutSeconds,
      tolerancePx: settings.tolerancePx,
      minimapRect: settings.minimapRect,
      regionName: settings.regionName,
    });
    alertManager.configure(
      settings.alertModes,
      settings.volume,
      settings.customSoundPath,
    );
    sessionEngine.start();
  });

  ipcMain.handle(IPC.STOP_TRAINING, () => {
    const record = sessionEngine.stop();
    alertManager.dismiss();
    if (record && record.durationS >= 10) {
      addSessionRecord(record);
    }
  });

  ipcMain.handle(IPC.MARK_MANUAL_GLANCE, () => {
    sessionEngine.markManualGlance();
  });

  ipcMain.handle(IPC.SET_ENTITLEMENT, (_e, tier) => {
    return setEntitlement(tier);
  });

  ipcMain.handle(IPC.PICK_CUSTOM_SOUND, async () => {
    if (!mainWindow) return '';
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose Alert Sound',
      filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'flac'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return '';
    return result.filePaths[0];
  });

  ipcMain.handle(IPC.OPEN_REGION_OVERLAY, async () => {
    return createRegionOverlay();
  });

  ipcMain.handle(IPC.CLEAR_HISTORY, () => {
    clearHistory();
  });

  ipcMain.handle(IPC.CHECK_CMP_REQUIRED, () => {
    try {
      const owElectron = require('@aspect-build/rules_ts/../ow-electron');
      return owElectron?.isCMPRequired?.() ?? false;
    } catch {
      return false;
    }
  });

  ipcMain.handle(IPC.OPEN_CMP_WINDOW, () => {
    try {
      const owElectron = require('@overwolf/ow-electron');
      owElectron?.openCMPWindow?.();
    } catch { /* not in ow-electron runtime */ }
  });

  ipcMain.on(IPC.MINIMIZE_WINDOW, () => {
    mainWindow?.minimize();
  });

  ipcMain.on(IPC.CLOSE_WINDOW, () => {
    mainWindow?.hide();
  });

  ipcMain.on(IPC.REGION_CONFIRM, (_e, rect: MinimapRect) => {
    // #region agent log
    dbg('index.ts:REGION_CONFIRM','IPC REGION_CONFIRM received',{rect},'H1');
    // #endregion
    if (regionResolve) {
      regionResolve(rect);
      regionResolve = null;
    }
    regionOverlayWindow?.close();
  });

  ipcMain.on(IPC.REGION_CANCEL, () => {
    // #region agent log
    dbg('index.ts:REGION_CANCEL','IPC REGION_CANCEL received',{},'H1');
    // #endregion
    if (regionResolve) {
      regionResolve(null);
      regionResolve = null;
    }
    regionOverlayWindow?.close();
  });
}

function applySettings(settings: PavlovSettings): void {
  irlWebhook.configure(settings.irlEnabled, settings.irlPort, settings.irlWebhookUrl);
  alertManager.configure(settings.alertModes, settings.volume, settings.customSoundPath);

  if (settings.hotkey) {
    globalShortcut.unregisterAll();
    try {
      globalShortcut.register(settings.hotkey, () => {
        if (sessionEngine.isRunning()) {
          sessionEngine.stop();
          alertManager.dismiss();
        } else {
          sessionEngine.configure({
            mode: settings.trainingMode,
            timeoutS: settings.timeoutSeconds,
            tolerancePx: settings.tolerancePx,
            minimapRect: settings.minimapRect,
            regionName: settings.regionName,
          });
          sessionEngine.start();
        }
      });
    } catch (err: unknown) {
      console.error('[Main] Failed to register hotkey:', (err as Error).message);
    }
  }
}

function wireEvents(): void {
  sessionEngine.on('state', (state) => {
    mainWindow?.webContents.send(IPC.ON_STATE, state);
  });

  sessionEngine.on('sessionComplete', (record) => {
    mainWindow?.webContents.send(IPC.ON_SESSION_COMPLETE, record);
  });

  sessionEngine.on('alert', (active: boolean) => {
    if (active) alertManager.trigger();
    else alertManager.dismiss();
  });

  beamBridge.onStatus = (status) => {
    mainWindow?.webContents.send(IPC.ON_BEAM_STATUS, status);
    trayManager.updateStatus(status);
  };

  beamBridge.onGaze = (data) => {
    sessionEngine.onGaze(data);
  };

  beamBridge.onError = (msg) => {
    console.error('[BeamBridge]', msg);
  };
}

async function bootstrap(): Promise<void> {
  migrateLegacyData();
  const settings = loadSettings();
  applySettings(settings);

  mainWindow = createMainWindow();
  alertOverlayWindow = createAlertOverlay();
  trayManager.create(mainWindow);

  registerIpcHandlers();
  wireEvents();

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  beamBridge.start(width, height, app.getAppPath(), process.execPath);
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  // On macOS keep running (convention). On Windows, we rely on tray.
});

app.on('before-quit', () => {
  beamBridge.stop();
  irlWebhook.shutdown();
  trayManager.destroy();
  globalShortcut.unregisterAll();
  mainWindow?.removeAllListeners('close');
  mainWindow?.destroy();
});

app.on('activate', () => {
  mainWindow?.show();
});
