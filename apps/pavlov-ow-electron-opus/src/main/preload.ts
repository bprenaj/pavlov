import { contextBridge, ipcRenderer } from 'electron';
import type { PavlovApi } from '../shared/types';
import type { EntitlementTier } from '../shared/constants';

const CH = {
  GET_BOOTSTRAP: 'pavlov:getBootstrap',
  PATCH_SETTINGS: 'pavlov:patchSettings',
  START_TRAINING: 'pavlov:startTraining',
  STOP_TRAINING: 'pavlov:stopTraining',
  MARK_MANUAL_GLANCE: 'pavlov:markManualGlance',
  SET_ENTITLEMENT: 'pavlov:setEntitlement',
  PICK_CUSTOM_SOUND: 'pavlov:pickCustomSound',
  OPEN_REGION_OVERLAY: 'pavlov:openRegionOverlay',
  CLEAR_HISTORY: 'pavlov:clearHistory',
  MINIMIZE_WINDOW: 'pavlov:minimizeWindow',
  CLOSE_WINDOW: 'pavlov:closeWindow',
  CHECK_CMP_REQUIRED: 'pavlov:checkCmpRequired',
  OPEN_CMP_WINDOW: 'pavlov:openCmpWindow',
  ON_STATE: 'pavlov:onState',
  ON_BEAM_STATUS: 'pavlov:onBeamStatus',
  ON_SESSION_COMPLETE: 'pavlov:onSessionComplete',
} as const;

const api: PavlovApi = {
  getBootstrap: () => ipcRenderer.invoke(CH.GET_BOOTSTRAP),
  patchSettings: (patch) => ipcRenderer.invoke(CH.PATCH_SETTINGS, patch),
  startTraining: () => ipcRenderer.invoke(CH.START_TRAINING),
  stopTraining: () => ipcRenderer.invoke(CH.STOP_TRAINING),
  markManualGlance: () => ipcRenderer.invoke(CH.MARK_MANUAL_GLANCE),
  setEntitlement: (tier: EntitlementTier) => ipcRenderer.invoke(CH.SET_ENTITLEMENT, tier),
  pickCustomSound: () => ipcRenderer.invoke(CH.PICK_CUSTOM_SOUND),
  openRegionOverlay: () => ipcRenderer.invoke(CH.OPEN_REGION_OVERLAY),
  clearHistory: () => ipcRenderer.invoke(CH.CLEAR_HISTORY),
  minimizeWindow: () => ipcRenderer.send(CH.MINIMIZE_WINDOW),
  closeWindow: () => ipcRenderer.send(CH.CLOSE_WINDOW),
  checkCmpRequired: () => ipcRenderer.invoke(CH.CHECK_CMP_REQUIRED),
  openCmpWindow: () => ipcRenderer.invoke(CH.OPEN_CMP_WINDOW),
  onState: (cb) => {
    ipcRenderer.on(CH.ON_STATE, (_e, state) => cb(state));
  },
  onBeamStatus: (cb) => {
    ipcRenderer.on(CH.ON_BEAM_STATUS, (_e, status) => cb(status));
  },
  onSessionComplete: (cb) => {
    ipcRenderer.on(CH.ON_SESSION_COMPLETE, (_e, record) => cb(record));
  },
};

contextBridge.exposeInMainWorld('pavlovApi', api);
