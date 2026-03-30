import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./ipcChannels";
import type { MinimapRect } from "../shared/models/types";

type OverlayInitPayload = {
  currentRect: MinimapRect | null;
};

type AlertOverlayPayload = {
  active: boolean;
  rect: MinimapRect | null;
};

contextBridge.exposeInMainWorld("regionOverlayApi", {
  confirmRegion: (rect: MinimapRect) =>
    ipcRenderer.send(IPC_CHANNELS.regionOverlayConfirm, rect),
  cancelRegion: () => ipcRenderer.send(IPC_CHANNELS.regionOverlayCancel),
  onInit: (callback: (payload: OverlayInitPayload) => void) => {
    const listener = (_event: unknown, payload: OverlayInitPayload) =>
      callback(payload);
    ipcRenderer.on(IPC_CHANNELS.regionOverlayInit, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.regionOverlayInit, listener);
  }
});

contextBridge.exposeInMainWorld("alertOverlayApi", {
  onOverlayState: (callback: (payload: AlertOverlayPayload) => void) => {
    const listener = (_event: unknown, payload: AlertOverlayPayload) =>
      callback(payload);
    ipcRenderer.on(IPC_CHANNELS.alertOverlayState, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.alertOverlayState, listener);
  }
});
