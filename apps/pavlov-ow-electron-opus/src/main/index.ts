import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  screen,
  shell,
  globalShortcut,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { IPC } from './ipc';
import {
  loadSettings,
  patchSettings,
  loadHistory,
  addSessionRecord,
  clearHistory,
  loadEntitlementTier,
  saveEntitlementTier,
} from './services/store';
import { getEntitlement, setEntitlement, isPaid, initEntitlement } from './services/entitlement';
import { migrateLegacyData } from './services/migration';
import { BeamBridge } from './services/beamBridge';
import { SessionEngine } from './services/sessionEngine';
import { AlertManager } from './services/alertManager';
import { IrlWebhook } from './services/irlWebhook';
import { TrayManager } from './services/tray';
import { UpdaterService } from './services/updater';
import { createOverlayWindow } from './services/overlayFactory';
import { getPreset, presetToRect } from '../shared/gamePresets';
import type { EntitlementTier, TrainingMode } from '../shared/constants';
import type { MinimapRect, PavlovSettings } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let alertOverlayWindow: BrowserWindow | null = null;
let regionOverlayWindow: BrowserWindow | null = null;
let regionResolve: ((rect: MinimapRect | null) => void) | null = null;
let registeredHotkey: string | null = null;

const beamBridge = new BeamBridge();
const sessionEngine = new SessionEngine();
const irlWebhook = new IrlWebhook();
const trayManager = new TrayManager();
const updater = new UpdaterService();

const alertManager = new AlertManager({
  playAudio: (soundPath, volume) => {
    mainWindow?.webContents.send(IPC.PLAY_ALERT, { soundPath, volume });
  },
  stopAudio: () => {
    mainWindow?.webContents.send(IPC.STOP_ALERT);
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

/** Paid coaching requires entitlement; everything else falls back to free. */
function effectiveTrainingMode(settings: PavlovSettings): TrainingMode {
  return settings.trainingMode === 'paid' && isPaid() ? 'paid' : 'free';
}

function configureSession(settings: PavlovSettings): void {
  sessionEngine.configure({
    mode: effectiveTrainingMode(settings),
    timeoutS: settings.timeoutSeconds,
    tolerancePx: settings.tolerancePx,
    minimapRect: settings.minimapRect,
    regionName: settings.regionName,
  });
  alertManager.configure(settings.alertModes, settings.volume, settings.customSoundPath);
}

/**
 * Branded window/taskbar icon. The packaged exe carries build/icon.ico as a
 * resource, but dev runs (and some taskbar contexts) use the window icon, so
 * set it explicitly when the file is reachable.
 */
function getWindowIconPath(): string | undefined {
  // Dev runs only; the packaged exe already embeds build/icon.ico.
  const dev = path.join(__dirname, '..', '..', 'build', 'icon.ico');
  return fs.existsSync(dev) ? dev : undefined;
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
    icon: getWindowIconPath(),
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(getRendererPath('index.html'));

  // External links (Discord, Reddit share, IRL guide) go to the default
  // browser, never to a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

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
  if (regionResolve) {
    regionResolve(null);
    regionResolve = null;
  }
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
        preload: getOverlayPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    regionOverlayWindow.loadFile(getRendererPath('region-overlay.html'));

    // Safety layer 1: intercept keys at the Chromium level so Escape/Enter
    // work even if the overlay renderer never loaded.
    regionOverlayWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'Escape') {
        event.preventDefault();
        forceCloseRegionOverlay();
      } else if (input.key === 'Enter') {
        event.preventDefault();
        regionOverlayWindow?.webContents
          .executeJavaScript('window.__pendingRect || null')
          .then((rect: unknown) => {
            if (isMinimapRect(rect)) {
              if (regionResolve) {
                regionResolve(rect);
                regionResolve = null;
              }
              regionOverlayWindow?.close();
            }
          })
          .catch(() => {});
      }
    });

    // Safety layer 2: the overlay can never outlive 60 seconds.
    const safetyTimeout = setTimeout(() => {
      forceCloseRegionOverlay();
    }, 60_000);

    // Safety layer 3: global Escape works even without window focus.
    globalShortcut.register('Escape', () => {
      forceCloseRegionOverlay();
    });

    regionOverlayWindow.once('ready-to-show', () => {
      regionOverlayWindow?.show();
      regionOverlayWindow?.focus();
      regionOverlayWindow?.webContents.send(IPC.REGION_INIT, {
        screenWidth: width,
        screenHeight: height,
      });
    });

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

function isMinimapRect(value: unknown): value is MinimapRect {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.x === 'number' &&
    typeof r.y === 'number' &&
    typeof r.width === 'number' &&
    typeof r.height === 'number'
  );
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.GET_BOOTSTRAP, () => ({
    settings: loadSettings(),
    entitlement: getEntitlement(),
    beamStatus: beamBridge.getStatus(),
    history: loadHistory(),
    appVersion: app.getVersion(),
    updater: updater.getState(),
  }));

  ipcMain.handle(IPC.PATCH_SETTINGS, (_e, patch: Partial<PavlovSettings>) => {
    const updated = patchSettings(patch);
    applySettings(updated);
    return updated;
  });

  ipcMain.handle(IPC.START_TRAINING, () => {
    configureSession(loadSettings());
    sessionEngine.start();
  });

  ipcMain.handle(IPC.STOP_TRAINING, () => {
    sessionEngine.stop();
    alertManager.dismiss();
  });

  ipcMain.handle(IPC.MARK_MANUAL_GLANCE, () => {
    sessionEngine.markManualGlance();
  });

  ipcMain.handle(IPC.SET_ENTITLEMENT, (_e, tier: EntitlementTier) => {
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

  ipcMain.handle(IPC.APPLY_PRESET, (_e, key: string) => {
    const preset = getPreset(key);
    const current = loadSettings();
    if (!preset || key === 'custom') return current;
    const { width, height } = screen.getPrimaryDisplay().size;
    const rect = presetToRect(preset, width, height);
    const updated = patchSettings({ minimapRect: rect, regionName: preset.name });
    applySettings(updated);
    return updated;
  });

  ipcMain.handle(IPC.CLEAR_HISTORY, () => {
    clearHistory();
  });

  ipcMain.handle(IPC.CHECK_CMP_REQUIRED, () => {
    try {
      const owElectron = require('@overwolf/ow-electron');
      return owElectron?.isCMPRequired?.() ?? false;
    } catch {
      return false; // not running under ow-electron
    }
  });

  ipcMain.handle(IPC.OPEN_CMP_WINDOW, () => {
    try {
      const owElectron = require('@overwolf/ow-electron');
      owElectron?.openCMPWindow?.();
    } catch {
      /* not in ow-electron runtime */
    }
  });

  ipcMain.handle(IPC.UPDATER_CHECK, () => {
    updater.check();
  });

  ipcMain.handle(IPC.UPDATER_INSTALL, () => {
    updater.installNow();
  });

  ipcMain.on(IPC.MINIMIZE_WINDOW, () => {
    mainWindow?.minimize();
  });

  ipcMain.on(IPC.CLOSE_WINDOW, () => {
    mainWindow?.hide();
  });

  ipcMain.on(IPC.REGION_CONFIRM, (_e, rect: MinimapRect) => {
    if (regionResolve) {
      regionResolve(rect);
      regionResolve = null;
    }
    regionOverlayWindow?.close();
  });

  ipcMain.on(IPC.REGION_CANCEL, () => {
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

  // Swap only our own hotkey; never unregisterAll -- the region overlay's
  // temporary Escape shortcut must survive settings changes.
  if (registeredHotkey && registeredHotkey !== settings.hotkey) {
    globalShortcut.unregister(registeredHotkey);
    registeredHotkey = null;
  }

  if (settings.hotkey && settings.hotkey !== registeredHotkey) {
    try {
      globalShortcut.register(settings.hotkey, () => {
        if (sessionEngine.isRunning()) {
          sessionEngine.stop();
          alertManager.dismiss();
        } else {
          configureSession(loadSettings());
          sessionEngine.start();
        }
      });
      registeredHotkey = settings.hotkey;
    } catch (err: unknown) {
      console.error('[Main] Failed to register hotkey:', (err as Error).message);
    }
  }
}

function wireEvents(): void {
  sessionEngine.on('state', (state) => {
    mainWindow?.webContents.send(IPC.ON_STATE, state);
  });

  // Single persistence path for every way a session can end (button, hotkey,
  // tray). Sub-10s sessions are noise and are not recorded.
  sessionEngine.on('sessionComplete', (record) => {
    if (record && record.durationS >= 10) {
      addSessionRecord(record);
      mainWindow?.webContents.send(IPC.ON_SESSION_COMPLETE, record);
    }
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

function initUpdater(): void {
  trayManager.setUpdateHandler(() => updater.installNow());
  updater.init({
    isPackaged: app.isPackaged,
    getAutoUpdater: () => {
      // Lazy: electron-updater reads app metadata at require time and is
      // never needed in dev runs.
      const { autoUpdater } = require('electron-updater');
      return autoUpdater;
    },
    onStateChange: (state) => {
      mainWindow?.webContents.send(IPC.ON_UPDATER_STATE, state);
      trayManager.updateUpdaterState(state);
    },
  });
}

async function bootstrap(): Promise<void> {
  migrateLegacyData();
  initEntitlement({
    get: () => loadEntitlementTier() as EntitlementTier | null,
    set: (tier) => saveEntitlementTier(tier),
  });
  const settings = loadSettings();
  applySettings(settings);

  mainWindow = createMainWindow();
  alertOverlayWindow = createAlertOverlay();
  trayManager.create(mainWindow);

  registerIpcHandlers();
  wireEvents();
  initUpdater();

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  beamBridge.start(width, height, app.getAppPath(), process.execPath);
}

// App identity: name in menus/notifications and the Windows AppUserModelID
// that ties taskbar grouping and toasts to the installed shortcut. Setting
// the AUMID without that shortcut (dev runs) makes the taskbar fall back to
// the exe icon, so only set it when packaged.
app.setName('Pavlov');
if (app.isPackaged) {
  app.setAppUserModelId('com.swisstropic.pavlov');
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  // Keep running: Pavlov lives in the tray while training.
});

app.on('before-quit', () => {
  sessionEngine.stop();
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
