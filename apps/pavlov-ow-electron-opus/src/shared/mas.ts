import {
  MAS_WEIGHT_CHECK_RATE,
  MAS_WEIGHT_RESPONSE_TIME,
  MAS_WEIGHT_PROCESSING_SPEED,
  MAS_WEIGHT_CONSISTENCY,
  MAS_PRO_GLANCES_PER_MIN,
  MAS_MAX_GAP_S,
  MAS_MIN_GAP_S,
  MAS_MAX_GLANCE_MS,
  MAS_MIN_GLANCE_MS,
  MAS_MAX_STD_DEV_S,
} from './constants';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Compute the Map Awareness Score (0-100).
 *
 * Weighted blend of four components normalized against
 * pro-player benchmarks derived from esports eye tracking research.
 */
export function computeMas(
  glancesPerMin: number,
  avgGapS: number,
  avgGlanceDurationMs: number,
  gapStdDevS: number,
): number {
  const freqScore = clamp((glancesPerMin / MAS_PRO_GLANCES_PER_MIN) * 100, 0, 100);

  let respScore: number;
  if (avgGapS <= 0) {
    respScore = 100;
  } else {
    const range = MAS_MAX_GAP_S - MAS_MIN_GAP_S;
    respScore = clamp((1 - (avgGapS - MAS_MIN_GAP_S) / range) * 100, 0, 100);
  }

  let procScore: number;
  if (avgGlanceDurationMs <= 0) {
    procScore = 50;
  } else {
    const range = MAS_MAX_GLANCE_MS - MAS_MIN_GLANCE_MS;
    procScore = clamp((1 - (avgGlanceDurationMs - MAS_MIN_GLANCE_MS) / range) * 100, 0, 100);
  }

  const consistScore = clamp((1 - gapStdDevS / MAS_MAX_STD_DEV_S) * 100, 0, 100);

  const mas =
    MAS_WEIGHT_CHECK_RATE * freqScore +
    MAS_WEIGHT_RESPONSE_TIME * respScore +
    MAS_WEIGHT_PROCESSING_SPEED * procScore +
    MAS_WEIGHT_CONSISTENCY * consistScore;

  return Math.round(clamp(mas, 0, 100) * 10) / 10;
}

/** Standard deviation helper for an array of numbers. */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
}
