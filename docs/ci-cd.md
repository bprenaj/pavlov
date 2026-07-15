# CI/CD: Tests, Beta Channel, Stable Releases, Download Site

This repo ships through three GitHub Actions workflows plus a Cloudflare
Pages site. Everything is driven by pushes; no manual packaging.

## Overview

```
push / PR (any branch)
  -> .github/workflows/test.yml
     typecheck + lint + full test suite (Windows runner)

push to main
  -> .github/workflows/beta.yml
     gates (typecheck, lint, tests), then builds the installer and
     publishes a GitHub *prerelease* versioned <next-patch>-beta.<run#>
     with beta.yml as its auto-update feed

push of a v* tag (npm version patch && git push --follow-tags)
  -> .github/workflows/release.yml
     gates, then publishes a full GitHub release with latest.yml

push to main touching site/**
  -> .github/workflows/pages.yml
     deploys site/ to Cloudflare Pages (project "pavlov")
```

## Update channels

The app derives its channel from its own version at runtime
(`channelForVersion` in `src/main/services/updater.ts`):

| Install | Version shape | Feed | Sees |
|---------|---------------|------|------|
| Stable | `1.0.4` | `latest.yml` (full releases) | stable only |
| Beta | `1.0.5-beta.42` | `beta.yml` (prereleases) | every merged build |

Beta behavior, by design ("the beta runs on your PC at all times"):

- Installs from the beta button on the download site (or any prerelease
  asset on GitHub Releases).
- On first packaged run it registers itself to start with Windows
  (one time only; if the user disables it in Task Manager it stays off).
- Checks for updates 30s after launch and every 4h, downloads in the
  background, installs on restart or quit. Every merge to main lands on
  every beta PC without anyone touching anything.
- Beta versions are always based on the next patch version, so they sort
  semver-newer than the current stable and updates always flow forward.

Leaving the beta: uninstall, then install the stable build. (A beta
install never downgrades itself to stable.)

## Beta versioning

`beta.yml` (the workflow) stamps the version at build time:

```
base   = package.json version with patch + 1 (e.g. 1.0.3 -> 1.0.4)
version = <base>-beta.<github run number>
```

The run number only increases, so beta versions are strictly monotonic.
The workflow also flips `build.publish.releaseType` to `prerelease` so
GitHub marks the release as a prerelease and stable users never see it.
The prerelease tag is created via `GITHUB_TOKEN`, which does not trigger
other workflows, so beta releases cannot recurse into `release.yml`.

## Cutting a stable release

Unchanged from before:

```bash
cd apps/pavlov-ow-electron-opus
npm version patch        # bumps package.json + creates the v* tag
git push --follow-tags   # release.yml builds + publishes
```

Never hand-edit or delete `latest.yml` or `beta.yml` on a release.

## Download site (Cloudflare Pages)

`site/index.html` is a static, dependency-free page with Stable and Beta
download buttons. It queries the public GitHub Releases API from the
browser, so it always links the newest installers without a redeploy.
Deploys only happen when `site/**` changes.

The site lives at **https://getmapsense.com** (domain registered on
Cloudflare, zone in the same account). The workflow is fully
self-provisioning and idempotent: on every run it ensures the Pages
project exists, deploys, attaches `getmapsense.com` and
`www.getmapsense.com` to the project, and creates the proxied CNAME
records pointing at `pavlov.pages.dev`. Existing DNS records that point
somewhere else are never clobbered (it warns instead).

### One-time Cloudflare setup

1. Create an API token (dashboard: My Profile > API Tokens) with:
   - Account > Cloudflare Pages > Edit
   - Zone > Zone > Read (for getmapsense.com)
   - Zone > DNS > Edit (for getmapsense.com)
2. Add two repository secrets in GitHub (Settings > Secrets and
   variables > Actions):
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID` (dashboard right sidebar, or `npx wrangler whoami`)
3. Push to main (or run the "Deploy Site" workflow manually). The
   workflow creates the project, deploys, and wires up the domain.

Until the secrets exist the deploy workflow skips with a warning instead
of failing, so CI stays green on forks and fresh clones. If the token
lacks the zone permissions, the deploy still succeeds and the site stays
reachable at `https://pavlov.pages.dev`; the workflow warns that the
domain was not attached.

## Guardrails

`tests/e2e/smoke.test.ts` enforces the pipeline shape: both release
workflows must gate publishing on typecheck/lint/tests, the beta workflow
must publish prereleases with `-beta.` versions, the updater channel and
beta launch-at-login must stay wired, the site must exist, and the
no-em-dash rule covers `site/` and `.github/workflows/` too.
