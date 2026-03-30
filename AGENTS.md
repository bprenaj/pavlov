# Pavlov - Agent Operating Guide

## Primary Source of Truth

- **Active app stack:** [`apps/pavlov-ow-electron-opus`](apps/pavlov-ow-electron-opus)
- **Prior incomplete attempt:** [`apps/pavlov-ow-electron`](apps/pavlov-ow-electron)
- **Legacy reference app:** Python/PySide implementation in [`src`](src)
- **Do not delete legacy code** until feature parity and release cutover are complete.

## Product Direction

- Product name is **Pavlov**.
- Audience is competitive gamers (roughly 12-25), especially LoL and similar titles.
- Voice is confident and slightly arrogant, but playful and not cringe.
- Use **Beam Eye Tracker** wording in UI copy (avoid shortening to just "Beam" in user-facing text).
- Keep labels close to legacy meaning; avoid random fluff renaming that harms clarity.
- Pavlov metaphor:
  - Pavlov = the coach
  - Bell = cue
  - Player = trainee
  - Minimap checks = rewarded habit loop

## Monetization and Modes

- **Free mode (must remain fully functional):**
  - timer-based blink + alarm cues
  - custom alarm upload
  - no Beam dependency
- **Paid mode (mock entitlement in repo right now):**
  - Beam gaze-driven coaching and stats
  - gated behind entitlement tier (`trial`/`paid`)
- **Overwolf-first strategy:**
  - `owadview` in free tier
  - CMP flow support
  - ow-electron packaging path

## Architecture Rules

- Main process orchestrates IPC, Beam bridge, tray, and lifecycle.
- Preload is the only renderer bridge (`contextIsolation: true`, no Node globals in renderer).
- Shared logic lives in `src/shared` and should be unit-tested.
- Beam FFI is isolated in one adapter (`beamBridge.ts`).
- Legacy JSON migration support is required (`%APPDATA%/MapSense`).
- Region setup should use click-drag overlay selection, not exposed raw XYWH inputs.
- Preserve progressive disclosure from legacy UX: onboarding + region-first gating before full controls.
- Keep the full metric surface (MAS + 9 metrics) visible and understandable.
- Use an integrated app shell (custom title bar and left navigation) rather than default OS chrome.

## Testing Rules

- Run before handoff from `apps/pavlov-ow-electron-opus`:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
- Current test count: 99 tests across 11 files (all passing)
- Add tests in the proper suite:
  - `tests/unit` for pure logic (MAS, region, presets, schemas, entitlement, alertManager, IPC)
  - `tests/integration` for session engine (free mode and paid mode)
  - `tests/ui` for renderer DOM structure (all elements, metrics, onboarding)
  - `tests/e2e` for smoke (file existence, script validity, HTML references)

## Docs Index

- Migration plan and architecture: [`docs/electron-migration.md`](docs/electron-migration.md)
- Overwolf monetization and CMP workflow: [`docs/monetization-overwolf.md`](docs/monetization-overwolf.md)
- Test matrix and quality gates: [`docs/testing-strategy.md`](docs/testing-strategy.md)

## External References

- [Overwolf SDK Introduction](https://dev.overwolf.com/ow-native/reference/ow-sdk-introduction/)
- [Overwolf Electron Technical Overview](https://dev.overwolf.com/ow-electron/getting-started/onboarding-resources/ow-electron-technical-overview/)
- [@overwolf/ow-electron npm package](https://www.npmjs.com/package/@overwolf/ow-electron)
