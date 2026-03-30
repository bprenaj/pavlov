# Pavlov ow-electron App

Pavlov is a minimap coaching app for competitive gamers. This app is the active Electron rewrite path.

## Scripts

- `npm run build` - compile TypeScript and copy renderer assets
- `npm start` - build then launch with standard Electron
- `npm run start:ow-electron` - build then launch with ow-electron runtime
- `npm run build:ow-electron` - package with ow-electron-builder
- `npm run typecheck` - run strict TypeScript checks
- `npm run lint` - run ESLint
- `npm test` - run tests with coverage

## Mode Model

- **Free mode:** timer cues, visual blink, custom sound support
- **Paid mode:** Beam gaze-driven coaching and deeper stats (gated by entitlement)

## Notes

- This folder is designed to coexist with the legacy Python app during migration.
- Legacy settings/history migration is supported from `%APPDATA%/MapSense`.
