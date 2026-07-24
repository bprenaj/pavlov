# MapSense Electron Migration

## Goal

Refactor MapSense from the legacy Python/PySide stack to a parallel ow-electron app while preserving behavior parity for coaching loops, session stats, and user settings.

## Current Target

- **Active implementation:** [`apps/mapsense`](../apps/mapsense)
- **Prior incomplete attempt:** [`apps/mapsense`](../apps/mapsense)
- **Legacy reference:** [`src`](../src)

## Module Mapping

| Legacy Python module | New ow-electron-opus module |
|---|---|
| `src/tracker.py` | `src/main/services/beamBridge.ts` |
| `src/minimap_detector.py` | `src/shared/region.ts` |
| `src/session_history.py` | `src/shared/mas.ts` + `src/main/services/sessionEngine.ts` |
| `src/settings.py` | `src/main/services/store.ts` |
| `src/game_presets.py` | `src/shared/gamePresets.ts` |
| `src/alert_manager.py` | `src/main/services/alertManager.ts` |
| `src/irl_webhook.py` | `src/main/services/irlWebhook.ts` |
| `src/ui/main_window.py` | `src/renderer/app.ts` + `src/renderer/index.html` |
| `src/ui/setup_overlay.py` | `src/renderer/regionOverlay.ts` + `region-overlay.html` |
| `src/ui/alert_overlay.py` | `src/renderer/alertOverlay.ts` + `alert-overlay.html` |

## Architecture

- **Main process**: app lifecycle, window management, IPC handlers, Beam bridge, session engine, alert manager, IRL webhook, tray
- **Preload**: typed `mapsenseApi` bridge via `contextBridge` (contextIsolation: true)
- **Renderer**: single `index.html` shell with Coach/History/Settings pages, no Node access
- **Shared**: pure TypeScript modules (types, schemas, MAS calc, region math, game presets)
- **Overlays**: separate transparent windows for region selection and alert flash

## Data Migration

Legacy data source:

- `%APPDATA%/MapSense/settings.json`
- `%APPDATA%/MapSense/history.json`

Migration service:

- `src/main/services/migration.ts`

Maps snake_case Python keys to camelCase TypeScript, validates through Zod schemas, writes to `%APPDATA%/MapSense/` and marks completion with `.migrated` marker file.

## Runtime Flow

1. App boots and loads persisted settings via electron-store.
2. Legacy migration runs if `.migrated` marker doesn't exist.
3. Beam bridge starts via koffi FFI and polls at 30 FPS.
4. Session engine handles free timer mode or paid Beam mode.
5. Renderer subscribes through typed preload IPC events.
6. Alert manager orchestrates audio/visual/IRL alerts.
7. Close hides to tray; quit via tray menu.

## Quality Gates (all passing)

- `npm run typecheck` - zero errors
- `npm run lint` - zero errors/warnings
- `npm test` - 99 tests across 11 files

## Release Notes

- Keep legacy Python code until production parity is validated.
- New distribution target is `ow-electron-builder`.
- Beam Eye Tracker DLL must be in the app directory or `C:\Program Files\Eyeware\BeamEyeTracker\`.
