import { z } from 'zod';

export const MinimapRectSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().min(1),
  height: z.number().min(1),
});

export const SavedRegionSchema = z.object({
  name: z.string().min(1),
  rect: MinimapRectSchema,
});

export const AlertModeSchema = z.enum(['silent', 'visual', 'audio', 'irl']);

export const TrainingModeSchema = z.enum(['free', 'paid']);

export const PavlovSettingsSchema = z.object({
  timeoutSeconds: z.number().min(0.5).max(300).default(5),
  volume: z.number().min(0).max(100).default(50),
  tolerancePx: z.number().min(0).max(200).default(10),
  alertModes: z.array(AlertModeSchema).default(['audio']),
  customSoundPath: z.string().default(''),
  minimapRect: MinimapRectSchema.nullable().default(null),
  regionName: z.string().default(''),
  savedRegions: z.array(SavedRegionSchema).default([]),
  hotkey: z.string().default(''),
  irlEnabled: z.boolean().default(false),
  irlPort: z.number().min(1024).max(65535).default(9876),
  irlWebhookUrl: z.string().default(''),
  firstRun: z.boolean().default(true),
  trainingMode: TrainingModeSchema.default('free'),
  analyticsOptOut: z.boolean().default(false),
  // Tray-resident coach: present from boot by default, with a visible toggle.
  launchAtStartup: z.boolean().default(true),
});

export const SessionRecordSchema = z.object({
  timestamp: z.number(),
  durationS: z.number(),
  glanceCount: z.number(),
  glancesPerMin: z.number(),
  avgGlanceDurationMs: z.number(),
  avgGapS: z.number(),
  longestGapS: z.number(),
  alertsTriggered: z.number(),
  alertFreeStreakS: z.number(),
  timeOnMapPct: z.number(),
  masScore: z.number(),
  regionName: z.string(),
});

export function parseSettings(raw: unknown): z.infer<typeof PavlovSettingsSchema> {
  return PavlovSettingsSchema.parse(raw);
}

export function safeParseSettings(raw: unknown) {
  const result = PavlovSettingsSchema.safeParse(raw);
  if (result.success) return result.data;
  return PavlovSettingsSchema.parse({});
}

export function parseSessionRecord(raw: unknown) {
  return SessionRecordSchema.parse(raw);
}

export function safeParseSessionRecords(raw: unknown): z.infer<typeof SessionRecordSchema>[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => SessionRecordSchema.safeParse(r))
    .filter((r) => r.success)
    .map((r) => r.data!);
}
