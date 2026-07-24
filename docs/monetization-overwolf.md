# MapSense Overwolf Monetization

## Strategy

MapSense follows an Overwolf-first freemium model:

- **Free tier:** timer-based coaching + ad-supported surfaces.
- **Paid tier:** Beam-powered coaching, advanced gaze-based stats, subscription entitlement.

## Current Implementation Status

- `owadview` element sits in the renderer free-tier ad panel inside an exact
  IAB 400x60 slot (`.ad-slot`); it renders real ads under the ow-electron
  runtime and is inert (placeholder text shows) in plain Electron dev runs.
  400x300 has the highest fill/CPM but needs a main-page layout decision
  (owner call, pending).

## Ads Activation Checklist (what is still needed for real ads)

No package declaration is needed: `owadview` ships inside ow-electron itself.
The remaining steps, in order:

1. **Get the app uid.** Run the packaged app (or `npm run start:ow-electron`)
   and read `[Main] Overwolf app uid: <uid>` from the console or
   `%APPDATA%/MapSense/logs/main.log`. The uid is derived from
   package.json `productName` + `author.name`, so those fields must not
   change afterwards.
2. **Ask Overwolf to enable the uid** via their
   [contact form](https://overwolf.github.io/support/contact-us). Until their
   backend lists the uid, `owadview` shows no fill anywhere. This is the
   long-pole step; ads revenue also requires an Overwolf developer account in
   their monetization program.
3. **Verify fill** in a packaged build (dev/unpackaged runs under
   `start:ow-electron` also work). The placeholder text showing through means
   no fill, not a bug.
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

## Analytics (what users actually do)

Two layers:

1. **Overwolf built-in** (free, on by default under ow-electron): DAU/WAU/MAU,
   retention, session length, and the ad/monetization metrics (ad revenue, LTV)
   that no third-party tool can see. Read from the Overwolf Developers Console.
2. **PostHog** (product-analytics brain): funnels, retention, cohorts.
   `src/main/services/analytics.ts` wraps `posthog-node` and sends from the
   **main process only** (the renderer CSP forbids remote SDKs).

**Privacy model (opt-out, anonymous):**
- Distinct-id is an anonymous install UUID (`store.getInstallId()`), never PII.
- Two hard guards in `AnalyticsService`: an **event allowlist**
  (`ANALYTICS_EVENTS`) and a **property sanitizer** (`ANALYTICS_SAFE_PROPS`).
  Eye position, screen region rects, local file paths, and device/webhook URLs
  can never be sent, even if a caller passes them by mistake.
- On by default when packaged; **"Send anonymous usage data"** toggle in
  Settings → Privacy & Ads flips `analyticsOptOut` live.
- Disabled entirely in dev (`!app.isPackaged`) and until a PostHog project key
  is set in `src/shared/analyticsConfig.ts` (write-only ingestion key, safe to
  commit; empty = fully inert).
- Startup surfaces the Overwolf CMP where the region requires it, before ads or
  analytics matter.

**Events tracked** (~13, allowlisted): app_opened, onboarding_completed,
region_selected, training_started/stopped, session_complete (aggregated MAS +
metrics only), mode_switched, trial_started, upgrade_clicked, entitlement_set,
preset_applied, update_installed, beam_status_changed.

**To go live:** create a free PostHog project, paste the Project API key + host
into `src/shared/analyticsConfig.ts`. Nothing else changes.

**Swapping tools:** the `AnalyticsService` client is injected (`getClient`), so
Mixpanel/Amplitude are drop-in replacements later without touching the guards.

## Next Step for Live Entitlements

Replace `entitlementMock.ts` with a real provider adapter while preserving the same interface used by renderer and session engine.

## References

- [Overwolf SDK Introduction](https://dev.overwolf.com/ow-native/reference/ow-sdk-introduction/)
- [Overwolf Electron Technical Overview](https://dev.overwolf.com/ow-electron/getting-started/onboarding-resources/ow-electron-technical-overview/)
- [@overwolf/ow-electron npm package](https://www.npmjs.com/package/@overwolf/ow-electron)
