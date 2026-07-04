export const IPC = {
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
  APPLY_PRESET: 'pavlov:applyPreset',
  UPDATER_CHECK: 'pavlov:updaterCheck',
  UPDATER_INSTALL: 'pavlov:updaterInstall',

  // Main -> Renderer push events
  ON_STATE: 'pavlov:onState',
  ON_BEAM_STATUS: 'pavlov:onBeamStatus',
  ON_SESSION_COMPLETE: 'pavlov:onSessionComplete',
  ON_UPDATER_STATE: 'pavlov:onUpdaterState',
  PLAY_ALERT: 'pavlov:playAlert',
  STOP_ALERT: 'pavlov:stopAlert',

  // Overlay channels
  REGION_CONFIRM: 'overlay:regionConfirm',
  REGION_CANCEL: 'overlay:regionCancel',
  REGION_INIT: 'overlay:regionInit',
  ALERT_STATE: 'overlay:alertState',
} as const;
