export const IPC_CHANNELS = {
  getBootstrap: "pavlov:get-bootstrap",
  patchSettings: "pavlov:patch-settings",
  startTraining: "pavlov:start-training",
  stopTraining: "pavlov:stop-training",
  setEntitlement: "pavlov:set-entitlement",
  pickCustomSound: "pavlov:pick-custom-sound",
  openRegionOverlay: "pavlov:open-region-overlay",
  windowMinimize: "pavlov:window-minimize",
  windowToggleMaximize: "pavlov:window-toggle-maximize",
  windowClose: "pavlov:window-close",
  checkCmpRequired: "pavlov:check-cmp-required",
  openCmpWindow: "pavlov:open-cmp-window",
  subscribeState: "pavlov:subscribe-state",
  subscribeBeamStatus: "pavlov:subscribe-beam-status",
  subscribeSession: "pavlov:subscribe-session",
  regionOverlayInit: "pavlov:region-overlay-init",
  regionOverlayConfirm: "pavlov:region-overlay-confirm",
  regionOverlayCancel: "pavlov:region-overlay-cancel",
  alertOverlayState: "pavlov:alert-overlay-state"
} as const;

export type IpcChannelMap = typeof IPC_CHANNELS;
