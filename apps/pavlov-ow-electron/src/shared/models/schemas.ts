import { z } from "zod";

export const alertModeSchema = z.object({
  audio: z.boolean(),
  visual: z.boolean()
});

export const minimapRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number()
});

export const appSettingsSchema = z.object({
  timeoutSeconds: z.number(),
  volume: z.number().min(0).max(100),
  gazeTolerance: z.number().min(0),
  alertMode: alertModeSchema,
  minimapRect: minimapRectSchema,
  regionName: z.string(),
  customSoundPath: z.string(),
  disableAnonymousAnalytics: z.boolean(),
  firstRun: z.boolean()
});

export const sessionRecordSchema = z.object({
  timestamp: z.number(),
  duration_s: z.number(),
  glance_count: z.number(),
  glances_per_min: z.number(),
  avg_glance_duration_ms: z.number(),
  avg_gap_s: z.number(),
  longest_gap_s: z.number(),
  alerts_triggered: z.number(),
  alert_free_streak_s: z.number(),
  time_on_map_pct: z.number(),
  mas_score: z.number(),
  region_name: z.string(),
  mode: z.enum(["free", "paid"])
});

export const legacySettingsSchema = z.object({
  timeout_seconds: z.number().optional(),
  volume: z.number().optional(),
  gaze_tolerance: z.number().optional(),
  alert_mode: alertModeSchema.partial().optional(),
  minimap_rect: minimapRectSchema.partial().optional(),
  region_name: z.string().optional(),
  first_run: z.boolean().optional(),
  hotkey: z.string().optional()
});

export const legacyHistorySchema = z.array(
  z.object({
    timestamp: z.number().optional(),
    duration_s: z.number().optional(),
    glance_count: z.number().optional(),
    glances_per_min: z.number().optional(),
    avg_glance_duration_ms: z.number().optional(),
    avg_gap_s: z.number().optional(),
    longest_gap_s: z.number().optional(),
    alerts_triggered: z.number().optional(),
    alert_free_streak_s: z.number().optional(),
    time_on_map_pct: z.number().optional(),
    mas_score: z.number().optional(),
    region_name: z.string().optional()
  })
);
