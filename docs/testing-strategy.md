# MapSense Testing Strategy

## Quality Gates

From `apps/mapsense`:

- `npm run typecheck`
- `npm run lint`
- `npm test`

## Test Suite Layout (137 tests, 13 files)

### Unit Tests (`tests/unit/`) - 71 tests

| File | Tests | What it covers |
|------|-------|----------------|
| `mas.test.ts` | 11 | MAS scoring: perfect, worst, mid-range, extreme, edge cases, std dev |
| `region.test.ts` | 11 | Tolerance expansion, point containment, gaze-in-region, ratio conversion, round-trip |
| `gamePresets.test.ts` | 10 | Preset values in range, names non-empty, getPreset, presetKeys, presetToRect, cornerLabel |
| `schemas.test.ts` | 11 | Zod validation: MinimapRect, MapSenseSettings defaults/full/reject, safe parse, session records |
| `entitlement.test.ts` | 10 | Default free, set tier, isPaid, invalid tier rejection, persistence via storage adapter |
| `alertManager.test.ts` | 6 | Audio/visual/IRL trigger, no double-trigger, dismiss all channels, isSilent |
| `ipc.test.ts` | 5 | Unique channel values, prefix check, required handlers/push/overlay channels |
| `updater.test.ts` | 9 | Dev-disabled, autoDownload config, scheduled checks, idle→checking→downloading→ready, error path, no re-check while staged, installNow gating, state push |
| `irlWebhook.test.ts` | 5 | /status endpoint, alert state reflection, port-change restart, disable stops server, 404 |

### Integration Tests (`tests/integration/`) - 19 tests

| File | Tests | What it covers |
|------|-------|----------------|
| `sessionEngine.free.test.ts` | 9 | Free mode: idle state, start, state events, alert after timeout, manual glance dismiss, glance counting, gaze ignored, session record, clean stop |
| `sessionEngine.paid.test.ts` | 10 | Paid mode: gaze in region, gaze outside, tolerance margin, timeout alert, gaze dismiss, gaze duration, non-tracking ignored, MAS computation, manual glance ignored, null rect handling |

### UI Tests (`tests/ui/`) - 30 tests

| File | Tests | What it covers |
|------|-------|----------------|
| `rendererLayout.test.ts` | 30 | Title bar, minimize/close, beam status, sidebar nav (3 links), avatar, 3 pages, region gate, MAS display, training buttons, 9 metric cards, history chart/list, settings controls (8 cards), onboarding 3 steps, audio element, Discord link, update banner + install/dismiss, updates settings card, pro modal, plan label, owadview element, no remote scripts/fonts, local Chart.js, CSP hardening |

### E2E Tests (`tests/e2e/`) - 9 tests

| File | Tests | What it covers |
|------|-------|----------------|
| `smoke.test.ts` | 9 | package.json scripts, tsconfig exists, source entry points, service files, shared modules, HTML script references, auto-update wiring (dep + publish feed + service), build script bundles chart.js/alert.wav, no leftover debug instrumentation |

## Packaged Smoke Test (before any release)

1. `npm run package` (NSIS installer + `release/win-unpacked/`)
2. Launch `release/win-unpacked/MapSense.exe`
3. Confirm: window opens, tray icon appears, Beam status resolves, quit from tray exits cleanly (no zombie processes)

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
