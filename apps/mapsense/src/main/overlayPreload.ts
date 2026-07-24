import { contextBridge, ipcRenderer } from 'electron';

const CH_REGION_CONFIRM = 'overlay:regionConfirm';
const CH_REGION_CANCEL = 'overlay:regionCancel';
const CH_REGION_INIT = 'overlay:regionInit';
const CH_ALERT_STATE = 'overlay:alertState';

contextBridge.exposeInMainWorld('regionOverlayApi', {
  confirmRegion: (rect: { x: number; y: number; width: number; height: number }) => {
    ipcRenderer.send(CH_REGION_CONFIRM, rect);
  },
  cancelRegion: () => {
    ipcRenderer.send(CH_REGION_CANCEL);
  },
  onInit: (cb: (data: { screenWidth: number; screenHeight: number }) => void) => {
    ipcRenderer.on(CH_REGION_INIT, (_e, data) => cb(data));
  },
});

contextBridge.exposeInMainWorld('alertOverlayApi', {
  onOverlayState: (cb: (active: boolean) => void) => {
    ipcRenderer.on(CH_ALERT_STATE, (_e, active) => cb(active));
  },
});
