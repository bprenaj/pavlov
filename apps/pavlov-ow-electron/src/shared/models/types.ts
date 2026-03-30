export type BeamStatus =
  | "not_installed"
  | "not_running"
  | "connecting"
  | "tracking";

export type CoachingMode = "free" | "paid";

export type EntitlementTier = "free" | "trial" | "paid";

export interface AlertMode {
  audio: boolean;
  visual: boolean;
}

export interface MinimapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppSettings {
  timeoutSeconds: number;
  volume: number;
  gazeTolerance: number;
  alertMode: AlertMode;
  minimapRect: MinimapRect;
  regionName: string;
  customSoundPath: string;
  disableAnonymousAnalytics: boolean;
  firstRun: boolean;
}

export interface GazeSample {
  x: number;
  y: number;
  confidence: number;
  timestamp: number;
  isTracking: boolean;
}

export interface SessionRecord {
  timestamp: number;
  duration_s: number;
  glance_count: number;
  glances_per_min: number;
  avg_glance_duration_ms: number;
  avg_gap_s: number;
  longest_gap_s: number;
  alerts_triggered: number;
  alert_free_streak_s: number;
  time_on_map_pct: number;
  mas_score: number;
  region_name: string;
  mode: CoachingMode;
}

export interface CoachingState {
  mode: CoachingMode;
  entitlement: EntitlementTier;
  beamStatus: BeamStatus;
  isTraining: boolean;
  alertActive: boolean;
  statusLine: string;
  remainingToAlertMs: number;
  lastSession?: SessionRecord;
}

export const DEFAULT_MINIMAP_RECT: MinimapRect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0
};

export const DEFAULT_SETTINGS: AppSettings = {
  timeoutSeconds: 5,
  volume: 50,
  gazeTolerance: 10,
  alertMode: {
    audio: true,
    visual: true
  },
  minimapRect: DEFAULT_MINIMAP_RECT,
  regionName: "",
  customSoundPath: "",
  disableAnonymousAnalytics: false,
  firstRun: true
};
