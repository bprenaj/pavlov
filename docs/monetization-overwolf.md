# Pavlov Overwolf Monetization

## Strategy

Pavlov follows an Overwolf-first freemium model:

- **Free tier:** timer-based coaching + ad-supported surfaces.
- **Paid tier:** Beam-powered coaching, advanced gaze-based stats, subscription entitlement.

## Current Implementation Status

- `owadview` is integrated in the renderer free-tier panel.
- CMP APIs are wired in main process:
  - `isCMPRequired`
  - `openCMPWindow`
- Entitlement is currently a **mock service** (`free`, `trial`, `paid`) to unblock product development while live subscription wiring is prepared.

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
