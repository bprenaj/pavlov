# Pavlov Testing Strategy

## Quality Gates

From `apps/pavlov-ow-electron-opus`:

- `npm run typecheck`
- `npm run lint`
- `npm test`

## Test Suite Layout (99 tests, 11 files)

### Unit Tests (`tests/unit/`) - 55 tests

| File | Tests | What it covers |
|------|-------|----------------|
| `mas.test.ts` | 11 | MAS scoring: perfect, worst, mid-range, extreme, edge cases, std dev |
| `region.test.ts` | 11 | Tolerance expansion, point containment, gaze-in-region, ratio conversion, round-trip |
| `gamePresets.test.ts` | 10 | Preset values in range, names non-empty, getPreset, presetKeys, presetToRect, cornerLabel |
| `schemas.test.ts` | 11 | Zod validation: MinimapRect, PavlovSettings defaults/full/reject, safe parse, session records |
| `entitlement.test.ts` | 5 | Default free, set tier, isPaid for free/trial/paid |
| `alertManager.test.ts` | 6 | Audio/visual/IRL trigger, no double-trigger, dismiss all channels, isSilent |
| `ipc.test.ts` | 5 | Unique channel values, prefix check, required handlers/push/overlay channels |

### Integration Tests (`tests/integration/`) - 19 tests

| File | Tests | What it covers |
|------|-------|----------------|
| `sessionEngine.free.test.ts` | 9 | Free mode: idle state, start, state events, alert after timeout, manual glance dismiss, glance counting, gaze ignored, session record, clean stop |
| `sessionEngine.paid.test.ts` | 10 | Paid mode: gaze in region, gaze outside, tolerance margin, timeout alert, gaze dismiss, gaze duration, non-tracking ignored, MAS computation, manual glance ignored, null rect handling |

### UI Tests (`tests/ui/`) - 15 tests

| File | Tests | What it covers |
|------|-------|----------------|
| `rendererLayout.test.ts` | 15 | Title bar, minimize/close, beam status, sidebar nav (3 links), avatar, 3 pages, region gate, MAS display, training buttons, 9 metric cards, history chart/list, settings controls, onboarding 3 steps, audio element, Discord link |

### E2E Tests (`tests/e2e/`) - 6 tests

| File | Tests | What it covers |
|------|-------|----------------|
| `smoke.test.ts` | 6 | package.json scripts, tsconfig exists, source entry points, service files, shared modules, HTML script references |

## Manual Validation Checklist

- Start app in free mode with Beam closed: timer cues should still work.
- Start app in paid mode with entitlement free: paid path should stay blocked.
- Switch entitlement to trial/paid and run paid mode.
- Verify session history updates and chart refresh after stopping session.
- Verify custom alarm sound selection and playback.
- In ow-electron runtime, validate CMP actions and ad panel behavior.
- Test on different screen resolutions and DPI scales.
- Verify region overlay click-drag selection works fullscreen.
- Verify alert overlay flashes on visual alert mode.
- Verify system tray icon shows, hides window on close, quits on tray menu.
