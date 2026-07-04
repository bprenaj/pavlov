# Pavlov Overwolf Monetization

## Strategy

Pavlov follows an Overwolf-first freemium model:

- **Free tier:** timer-based coaching + ad-supported surfaces.
- **Paid tier:** Beam-powered coaching, advanced gaze-based stats, subscription entitlement.

## Current Implementation Status

- `owadview` element sits in the renderer free-tier ad panel; it renders real ads
  under the ow-electron runtime and is inert (placeholder text shows) in plain
  Electron dev runs.
- CMP APIs are wired in main process via `require('@overwolf/ow-electron')` with
  graceful no-op outside the ow-electron runtime:
  - `isCMPRequired`
  - `openCMPWindow`
- Entitlement is a **mock service** (`free`, `trial`, `paid`) persisted across
  restarts via electron-store (`initEntitlement` + storage adapter in
  `src/main/services/entitlement.ts`). Live subscription wiring replaces the
  storage adapter, not the interface.
- Paid gating is enforced in the **main process**: `effectiveTrainingMode()`
  downgrades a `paid` training-mode setting to `free` whenever entitlement is
  `free`, no matter what the renderer sends.
- The renderer pitches the trial (`proModal`) when a free user selects Pro mode
  or clicks Go Pro; starting the trial sets tier `trial` and enables gaze mode.
- Ads hide for `trial` and `paid` tiers; the plan is shown in Settings → Privacy & Ads.

## CMP Best Practice

1. Check CMP requirement on startup.
2. Provide a visible CMP settings entry point.
3. Keep consent messaging clear before ads/subscription actions.

## Paid Gating Rules

- Paid coaching must not activate when entitlement is `free`.
- If user selects paid mode without entitlement, present upgrade messaging and keep free mode available.
- Beam not installed or unavailable must degrade gracefully without app crashes.

## Next Step for Live Entitlements

Replace `entitlementMock.ts` with a real provider adapter while preserving the same interface used by renderer and session engine.

## References

- [Overwolf SDK Introduction](https://dev.overwolf.com/ow-native/reference/ow-sdk-introduction/)
- [Overwolf Electron Technical Overview](https://dev.overwolf.com/ow-electron/getting-started/onboarding-resources/ow-electron-technical-overview/)
- [@overwolf/ow-electron npm package](https://www.npmjs.com/package/@overwolf/ow-electron)
