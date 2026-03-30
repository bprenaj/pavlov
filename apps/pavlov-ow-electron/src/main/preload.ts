import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./ipcChannels";
import type {
  AppSettings,
  CoachingMode,
  CoachingState,
  EntitlementTier,
  MinimapRect,
  SessionRecord
} from "../shared/models/types";

type BootstrapPayload = {
  settings: AppSettings;
  sessions: SessionRecord[];
  entitlement: EntitlementTier;
  isOverwolfRuntime: boolean;
  overwolfInfo: { appId: string } | null;
  cmpRequired: boolean;
};

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.off(channel, listener);
}

const pavlovApi = {
  getBootstrap: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getBootstrap) as Promise<BootstrapPayload>,
  patchSettings: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke(IPC_CHANNELS.patchSettings, patch) as Promise<AppSettings>,
  startTraining: (mode: CoachingMode) =>
    ipcRenderer.invoke(IPC_CHANNELS.startTraining, mode) as Promise<{
      ok: boolean;
      reason?: string;
    }>,
  stopTraining: () =>
    ipcRenderer.invoke(IPC_CHANNELS.stopTraining) as Promise<SessionRecord | null>,
  setEntitlement: (tier: EntitlementTier) =>
    ipcRenderer.invoke(IPC_CHANNELS.setEntitlement, tier) as Promise<EntitlementTier>,
  pickCustomSound: () =>
    ipcRenderer.invoke(IPC_CHANNELS.pickCustomSound) as Promise<string>,
  openRegionOverlay: () =>
    ipcRenderer.invoke(IPC_CHANNELS.openRegionOverlay) as Promise<MinimapRect | null>,
  windowMinimize: () => ipcRenderer.invoke(IPC_CHANNELS.windowMinimize) as Promise<void>,
  windowToggleMaximize: () =>
    ipcRenderer.invoke(IPC_CHANNELS.windowToggleMaximize) as Promise<void>,
  windowClose: () => ipcRenderer.invoke(IPC_CHANNELS.windowClose) as Promise<void>,
  checkCmpRequired: () =>
    ipcRenderer.invoke(IPC_CHANNELS.checkCmpRequired) as Promise<boolean>,
  openCmpWindow: () =>
    ipcRenderer.invoke(IPC_CHANNELS.openCmpWindow) as Promise<boolean>,
  onState: (callback: (state: CoachingState) => void) =>
    subscribe(IPC_CHANNELS.subscribeState, callback),
  onBeamStatus: (callback: (status: string) => void) =>
    subscribe(IPC_CHANNELS.subscribeBeamStatus, callback),
  onSessionComplete: (callback: (record: SessionRecord) => void) =>
    subscribe(IPC_CHANNELS.subscribeSession, callback)
};

contextBridge.exposeInMainWorld("pavlovApi", pavlovApi);
