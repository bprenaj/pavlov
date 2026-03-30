import path from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  screen,
  Tray
} from "electron";
import { isElectronOverwolf, overwolfInfo } from "@overwolf/electron-is-overwolf";
import { IPC_CHANNELS } from "./ipcChannels";
import { AppStoreService } from "./services/appStore";
import { BeamBridge } from "./services/beamBridge";
import { EntitlementMockService } from "./services/entitlementMock";
import { migrateLegacyMapSenseData } from "./services/legacyMigration";
import { createPavlovIcon } from "./services/pavlovIcon";
import { SessionEngine } from "./services/sessionEngine";
import type {
  AppSettings,
  CoachingMode,
  EntitlementTier,
  MinimapRect
} from "../shared/models/types";

type OverwolfCapableApp = typeof app & {
  overwolf?: {
    disableAnonymousAnalytics?: () => void;
    isCMPRequired?: () => Promise<boolean>;
    openCMPWindow?: () => void;
  };
};

let mainWindow: BrowserWindow | null = null;
let alertOverlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let cmpRequiredCached = false;

let appStore: AppStoreService;
let entitlementService: EntitlementMockService;
let sessionEngine: SessionEngine;
let beamBridge: BeamBridge;
let currentSettings: AppSettings;

const isOverwolfRuntime = Boolean(isElectronOverwolf);
const owApp = app as OverwolfCapableApp;

async function bootstrap() {
  const appDataPath = path.join(app.getPath("userData"), "pavlov");
  appStore = new AppStoreService(appDataPath);
  await migrateLegacyMapSenseData(appStore);

  currentSettings = await appStore.loadSettings();
  const meta = await appStore.getMeta();
  entitlementService = new EntitlementMockService(meta.entitlement);

  const display = screen.getPrimaryDisplay();
  const screenWidth = display.bounds.width;
  const screenHeight = display.bounds.height;
  sessionEngine = new SessionEngine(currentSettings, screenWidth, screenHeight);

  beamBridge = new BeamBridge();
  beamBridge.on("status", (status) => {
    sessionEngine.setBeamStatus(status);
    emitToRenderer(IPC_CHANNELS.subscribeBeamStatus, status);
  });
  beamBridge.on("gaze", (gaze) => {
    sessionEngine.onGaze(gaze);
  });
  beamBridge.on("error", (error) => {
    sessionEngine.setBeamStatus("not_installed");
    emitToRenderer(IPC_CHANNELS.subscribeBeamStatus, "not_installed");
    emitToRenderer(IPC_CHANNELS.subscribeState, {
      mode: "free",
      entitlement: entitlementService.getTier(),
      beamStatus: "not_installed",
      isTraining: false,
      alertActive: false,
      statusLine: String(error),
      remainingToAlertMs: 0
    });
  });

  sessionEngine.on("state", (state) => {
    emitToRenderer(IPC_CHANNELS.subscribeState, state);
  });

  sessionEngine.on("sessionComplete", async (record) => {
    await appStore.appendSession(record);
    emitToRenderer(IPC_CHANNELS.subscribeSession, record);
  });

  sessionEngine.on("alert", (active) => {
    updateAlertOverlay(active);
  });

  const started = beamBridge.start(
    screenWidth,
    screenHeight,
    app.getAppPath(),
    process.execPath
  );
  if (!started) {
    sessionEngine.setBeamStatus("not_installed");
    emitToRenderer(IPC_CHANNELS.subscribeBeamStatus, "not_installed");
  } else {
    emitToRenderer(IPC_CHANNELS.subscribeBeamStatus, "connecting");
  }
}

function createWindow() {
  const preloadPath = path.join(__dirname, "preload.js");
  const htmlPath = path.join(__dirname, "..", "renderer", "index.html");
  const icon = createPavlovIcon();

  mainWindow = new BrowserWindow({
    width: 1380,
    height: 920,
    minWidth: 1160,
    minHeight: 760,
    show: false,
    title: "Pavlov",
    frame: false,
    backgroundColor: "#0B1220",
    icon,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath
    }
  });

  mainWindow.loadFile(htmlPath).catch((error) => {
    console.error("Failed to load renderer:", error);
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray() {
  const icon = createPavlovIcon().resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip("Pavlov - Minimap awareness coach");
  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open Pavlov",
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        }
      },
      {
        type: "separator"
      },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

function createAlertOverlayWindow() {
  const preloadPath = path.join(__dirname, "overlayPreload.js");
  const htmlPath = path.join(__dirname, "..", "renderer", "alert-overlay.html");

  alertOverlayWindow = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    focusable: false,
    fullscreen: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  alertOverlayWindow.setAlwaysOnTop(true, "screen-saver");
  alertOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  alertOverlayWindow.setIgnoreMouseEvents(true, { forward: true });
  alertOverlayWindow.loadFile(htmlPath).catch((error) => {
    console.error("Failed to load alert overlay:", error);
  });
}

function hasRegion(rect: MinimapRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

function updateAlertOverlay(active: boolean) {
  if (!alertOverlayWindow || alertOverlayWindow.isDestroyed()) {
    return;
  }

  const region = hasRegion(currentSettings.minimapRect)
    ? currentSettings.minimapRect
    : null;
  const shouldShow = active && currentSettings.alertMode.visual && Boolean(region);

  alertOverlayWindow.webContents.send(IPC_CHANNELS.alertOverlayState, {
    active: shouldShow,
    rect: region
  });

  if (shouldShow) {
    alertOverlayWindow.showInactive();
    alertOverlayWindow.setAlwaysOnTop(true, "screen-saver");
  } else {
    alertOverlayWindow.hide();
  }
}

async function selectRegionOnScreen(): Promise<MinimapRect | null> {
  const preloadPath = path.join(__dirname, "overlayPreload.js");
  const htmlPath = path.join(__dirname, "..", "renderer", "region-overlay.html");
  const currentRect = hasRegion(currentSettings.minimapRect)
    ? currentSettings.minimapRect
    : null;

  return new Promise((resolve) => {
    const overlayWindow = new BrowserWindow({
      frame: false,
      transparent: true,
      fullscreen: true,
      show: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    let done = false;
    const finish = (rect: MinimapRect | null) => {
      if (done) {
        return;
      }
      done = true;
      ipcMain.off(IPC_CHANNELS.regionOverlayConfirm, onConfirm);
      ipcMain.off(IPC_CHANNELS.regionOverlayCancel, onCancel);
      if (!overlayWindow.isDestroyed()) {
        overlayWindow.close();
      }
      resolve(rect);
    };

    const onConfirm = (_event: unknown, rect: MinimapRect) => {
      if (!rect || rect.width <= 10 || rect.height <= 10) {
        finish(null);
        return;
      }
      finish(rect);
    };
    const onCancel = () => finish(null);

    ipcMain.on(IPC_CHANNELS.regionOverlayConfirm, onConfirm);
    ipcMain.on(IPC_CHANNELS.regionOverlayCancel, onCancel);

    overlayWindow.on("closed", () => finish(null));
    overlayWindow
      .loadFile(htmlPath)
      .then(() => {
        overlayWindow.show();
        overlayWindow.focus();
        overlayWindow.webContents.send(IPC_CHANNELS.regionOverlayInit, {
          currentRect
        });
      })
      .catch((error) => {
        console.error("Failed to load region overlay:", error);
        finish(null);
      });
  });
}

function registerIpc() {
  ipcMain.handle(IPC_CHANNELS.getBootstrap, async () => {
    const sessions = await appStore.loadSessions();
    return {
      settings: currentSettings,
      sessions,
      entitlement: entitlementService.getTier(),
      isOverwolfRuntime,
      overwolfInfo: isOverwolfRuntime ? overwolfInfo() : null,
      cmpRequired: cmpRequiredCached
    };
  });

  ipcMain.handle(
    IPC_CHANNELS.patchSettings,
    async (_event, patch: Partial<AppSettings>) => {
      currentSettings = await appStore.patchSettings(patch);
      sessionEngine.updateSettings(currentSettings);
      if (!currentSettings.alertMode.visual) {
        updateAlertOverlay(false);
      }
      return currentSettings;
    }
  );

  ipcMain.handle(IPC_CHANNELS.startTraining, async (_event, mode: CoachingMode) => {
    const regionReady =
      hasRegion(currentSettings.minimapRect) &&
      currentSettings.regionName.trim().length > 0;
    if (!regionReady) {
      return {
        ok: false,
        reason: "region_required"
      };
    }

    if (mode === "paid" && !entitlementService.canUsePaidMode()) {
      return {
        ok: false,
        reason: "paid_locked"
      };
    }

    sessionEngine.start(mode);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.stopTraining, async () => {
    const record = sessionEngine.stop();
    return record;
  });

  ipcMain.handle(
    IPC_CHANNELS.setEntitlement,
    async (_event, nextTier: EntitlementTier) => {
      const updated = entitlementService.setTier(nextTier);
      await appStore.setEntitlement(updated);
      sessionEngine.setEntitlement(updated);
      return updated;
    }
  );

  ipcMain.handle(IPC_CHANNELS.pickCustomSound, async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose a custom alarm sound",
      properties: ["openFile"],
      filters: [{ name: "Audio", extensions: ["wav", "mp3", "ogg"] }]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return "";
    }
    const selected = result.filePaths[0];
    currentSettings = await appStore.patchSettings({ customSoundPath: selected });
    sessionEngine.updateSettings(currentSettings);
    return selected;
  });

  ipcMain.handle(IPC_CHANNELS.openRegionOverlay, async () => {
    const rect = await selectRegionOnScreen();
    if (!rect) {
      return null;
    }
    currentSettings = await appStore.patchSettings({
      minimapRect: rect
    });
    sessionEngine.updateSettings(currentSettings);
    updateAlertOverlay(false);
    return rect;
  });

  ipcMain.handle(IPC_CHANNELS.windowMinimize, async () => {
    mainWindow?.minimize();
  });

  ipcMain.handle(IPC_CHANNELS.windowToggleMaximize, async () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.handle(IPC_CHANNELS.windowClose, async () => {
    mainWindow?.close();
  });

  ipcMain.handle(IPC_CHANNELS.checkCmpRequired, async () => {
    cmpRequiredCached = await queryCmpRequired();
    return cmpRequiredCached;
  });

  ipcMain.handle(IPC_CHANNELS.openCmpWindow, async () => {
    if (isOverwolfRuntime && owApp.overwolf?.openCMPWindow) {
      owApp.overwolf.openCMPWindow();
      return true;
    }
    return false;
  });
}

function emitToRenderer(channel: string, payload: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

async function queryCmpRequired(): Promise<boolean> {
  if (!isOverwolfRuntime || !owApp.overwolf?.isCMPRequired) {
    return false;
  }
  try {
    return await owApp.overwolf.isCMPRequired();
  } catch {
    return false;
  }
}

async function main() {
  await app.whenReady();
  app.setAppUserModelId("com.swisstropic.pavlov");

  await bootstrap();
  sessionEngine.setEntitlement(entitlementService.getTier());

  if (isOverwolfRuntime && currentSettings.disableAnonymousAnalytics) {
    owApp.overwolf?.disableAnonymousAnalytics?.();
  }
  cmpRequiredCached = await queryCmpRequired();

  registerIpc();
  createWindow();
  createTray();
  createAlertOverlayWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  sessionEngine?.stop();
  beamBridge?.stop();
  tray?.destroy();
  alertOverlayWindow?.destroy();
});

main().catch((error) => {
  console.error("App bootstrap failed:", error);
  app.quit();
});
