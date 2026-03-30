import { contextBridge, ipcRenderer } from 'electron';

const CH_REGION_CONFIRM = 'overlay:regionConfirm';
const CH_REGION_CANCEL = 'overlay:regionCancel';
const CH_REGION_INIT = 'overlay:regionInit';
const CH_ALERT_STATE = 'overlay:alertState';

// #region agent log
console.log('[DBG293] overlayPreload.ts executing (inlined channels)');
// #endregion

contextBridge.exposeInMainWorld('regionOverlayApi', {
  confirmRegion: (rect: { x: number; y: number; width: number; height: number }) => {
    // #region agent log
    console.log('[DBG293] regionOverlayApi.confirmRegion called, rect=' + JSON.stringify(rect));
    // #endregion
    ipcRenderer.send(CH_REGION_CONFIRM, rect);
  },
  cancelRegion: () => {
    // #region agent log
    console.log('[DBG293] regionOverlayApi.cancelRegion called');
    // #endregion
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

// #region agent log
console.log('[DBG293] overlayPreload.ts finished - both APIs exposed');
// #endregion
