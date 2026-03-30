export interface MasInputs {
  glancesPerMin: number;
  averageGapSeconds: number;
  averageGlanceDurationMs: number;
  gapStdDevSeconds: number;
}

export function computeMas({
  glancesPerMin,
  averageGapSeconds,
  averageGlanceDurationMs,
  gapStdDevSeconds
}: MasInputs): number {
  const freqScore = Math.min(100, (glancesPerMin / 8) * 100);

  const responseScore =
    averageGapSeconds <= 0
      ? 100
      : clamp((1 - (averageGapSeconds - 2) / 8) * 100, 0, 100);

  const processingScore =
    averageGlanceDurationMs <= 0
      ? 50
      : clamp((1 - (averageGlanceDurationMs - 200) / 600) * 100, 0, 100);

  const consistencyScore = clamp((1 - gapStdDevSeconds / 5) * 100, 0, 100);

  const mas =
    0.4 * freqScore +
    0.25 * responseScore +
    0.2 * processingScore +
    0.15 * consistencyScore;

  return Math.round(clamp(mas, 0, 100) * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
