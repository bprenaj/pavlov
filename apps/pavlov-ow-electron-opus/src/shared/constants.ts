export const APP_NAME = 'Pavlov';
export const APP_ID = 'com.swisstropic.pavlov';
export const APP_DATA_DIR = 'Pavlov';
export const LEGACY_DATA_DIR = 'MapSense';

export const DISCORD_URL = 'https://discord.gg/khk2dq8Bj3';
export const REDDIT_SHARE_BASE = 'https://www.reddit.com/r/leagueoflegends/submit';

export const BEAM_POLL_FPS = 30;
export const BEAM_POLL_INTERVAL_MS = Math.round(1000 / BEAM_POLL_FPS);
export const BEAM_STATUS_CHECK_MS = 2000;
export const BEAM_AUTO_START_MS = 5000;

export const ALERT_COOLDOWN_MS = 500;
export const DEFAULT_TIMEOUT_S = 5;
export const MIN_TIMEOUT_S = 3;
export const MAX_TIMEOUT_S = 300;
export const DEFAULT_VOLUME = 50;
export const DEFAULT_TOLERANCE_PX = 10;
export const IRL_DEFAULT_PORT = 9876;

export const GAZE_CONFIDENCE_MEDIUM = 2;

export const UPDATE_FIRST_CHECK_DELAY_MS = 30 * 1000;
export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export const VIEWPORT_GAZE_CONFIDENCE_OFFSET = 104;
export const VIEWPORT_GAZE_X_OFFSET = 112;
export const VIEWPORT_GAZE_Y_OFFSET = 116;

export const MAS_WEIGHT_CHECK_RATE = 0.40;
export const MAS_WEIGHT_RESPONSE_TIME = 0.25;
export const MAS_WEIGHT_PROCESSING_SPEED = 0.20;
export const MAS_WEIGHT_CONSISTENCY = 0.15;

export const MAS_PRO_GLANCES_PER_MIN = 8;
export const MAS_MAX_GAP_S = 10;
export const MAS_MIN_GAP_S = 2;
export const MAS_MAX_GLANCE_MS = 800;
export const MAS_MIN_GLANCE_MS = 200;
export const MAS_MAX_STD_DEV_S = 5;

export type BeamStatus = 'not_installed' | 'not_running' | 'connecting' | 'tracking';
export type EntitlementTier = 'free' | 'trial' | 'paid';
export type AlertMode = 'silent' | 'visual' | 'audio' | 'irl';
export type TrainingMode = 'free' | 'paid';
export type UpdaterStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'error' | 'disabled';
