import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  UPDATE_FIRST_CHECK_DELAY_MS,
  UPDATE_CHECK_INTERVAL_MS,
} from '../../shared/constants';
import type { UpdaterState } from '../../shared/types';

/**
 * Auto-update against GitHub Releases via electron-updater.
 *
 * Flow (Cursor-style): checks quietly in the background, downloads
 * automatically, then surfaces a "Restart to update" prompt in the renderer.
 * Clicking it installs immediately and relaunches. If the user ignores it,
 * the update installs on next quit (autoInstallOnAppQuit).
 *
 * Disabled in dev (unpackaged) runs. All electron-updater interaction goes
 * through the injected `AutoUpdaterLike` so the state machine is testable
 * without Electron.
 */

/**
 * Updater cache hygiene (Auto-Update Standard rule 9).
 *
 * electron-updater pairs <cache>/installer.exe (a byte-copy of the last
 * INSTALLED installer, parked by the NSIS installer as the differential
 * base; one full installer big, by design, never delete it) with a cached
 * <cache>/current.blockmap that tracks the last DOWNLOADED build. Re-checks
 * while an update is staged (rule 8) make the pair desync whenever a staged
 * update is superseded before a restart; every differential download then
 * fails its sha512 check and silently falls back to a full download.
 * Deleting the cached blockmap before each check forces electron-updater to
 * re-fetch the blockmap of the RUNNING version by URL, which matches
 * installer.exe after any normal install.
 *
 * Separately, quitting mid-download strands pending/temp-* partials forever;
 * they are pruned at startup, when no download can be in flight yet.
 */
export function updaterCacheDir(
  resourcesPath: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
): string | null {
  try {
    const yml = fs.readFileSync(path.join(resourcesPath, 'app-update.yml'), 'utf8');
    const m = /^updaterCacheDirName:\s*(\S+)\s*$/m.exec(yml);
    if (!m) return null;
    const base =
      platform === 'win32'
        ? (env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'))
        : platform === 'darwin'
          ? path.join(home, 'Library', 'Caches')
          : (env.XDG_CACHE_HOME ?? path.join(home, '.cache'));
    return path.join(base, m[1]);
  } catch {
    return null;
  }
}

export function dropStaleBlockmap(cacheDir: string | null): void {
  if (!cacheDir) return;
  try {
    fs.rmSync(path.join(cacheDir, 'current.blockmap'), { force: true });
  } catch {
    /* never let cache hygiene break the updater */
  }
}

export function pruneStrandedPartials(cacheDir: string | null): string[] {
  if (!cacheDir) return [];
  const removed: string[] = [];
  try {
    const pending = path.join(cacheDir, 'pending');
    for (const name of fs.readdirSync(pending)) {
      if (!name.startsWith('temp-')) continue;
      try {
        fs.rmSync(path.join(pending, name), { force: true });
        removed.push(name);
      } catch {
        /* locked or gone, either is fine */
      }
    }
  } catch {
    /* no pending dir yet */
  }
  return removed;
}

export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  logger?: unknown;
  on(event: string, listener: (...args: never[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export interface UpdaterOptions {
  /** false in dev -- updater stays disabled */
  isPackaged: boolean;
  /** lazily provides the electron-updater instance (not loaded in dev/tests) */
  getAutoUpdater: () => AutoUpdaterLike;
  /** called whenever state changes, e.g. push to renderer + tray */
  onStateChange: (state: UpdaterState) => void;
  /**
   * electron-updater's download cache dir (updaterCacheDir()); null/omitted
   * skips cache hygiene (dev, tests without a cache).
   */
  cacheDir?: string | null;
  /** scheduling seams, default to real timers */
  setTimeoutFn?: typeof setTimeout;
  setIntervalFn?: typeof setInterval;
}

export class UpdaterService {
  private state: UpdaterState = { status: 'idle', availableVersion: null, error: null };
  private autoUpdater: AutoUpdaterLike | null = null;
  private onStateChange: (state: UpdaterState) => void = () => {};
  private cacheDir: string | null = null;
  private lastReadyVersion: string | null = null;

  getState(): UpdaterState {
    return { ...this.state };
  }

  init(opts: UpdaterOptions): void {
    this.onStateChange = opts.onStateChange;

    if (!opts.isPackaged) {
      this.set({ status: 'disabled' });
      console.log('[Updater] Dev mode -- auto-update disabled');
      return;
    }

    let updater: AutoUpdaterLike;
    try {
      updater = opts.getAutoUpdater();
    } catch (e: unknown) {
      this.set({ status: 'disabled', error: (e as Error).message });
      console.error('[Updater] electron-updater unavailable:', (e as Error).message);
      return;
    }

    this.autoUpdater = updater;
    this.cacheDir = opts.cacheDir ?? null;
    const pruned = pruneStrandedPartials(this.cacheDir);
    if (pruned.length) {
      console.log(`[Updater] Removed stranded partial download(s): ${pruned.join(', ')}`);
    }
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.logger = {
      info: (m: unknown) => console.log('[Updater]', m),
      warn: (m: unknown) => console.log('[Updater][warn]', m),
      error: (m: unknown) => console.error('[Updater]', m),
      debug: () => {},
    };

    updater.on('checking-for-update', () => this.set({ status: 'checking' }));
    updater.on('update-available', (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined;
      this.set({ status: 'downloading', availableVersion: info?.version ?? null });
    });
    updater.on('update-not-available', () => {
      this.set({ status: 'idle', availableVersion: null });
    });
    updater.on('update-cancelled', () => {
      // Without this a cancelled download leaves status stuck at
      // 'downloading', and check() skips every future scheduled check.
      this.set({ status: 'idle', availableVersion: null });
      console.log('[Updater] Download cancelled; will retry on next check');
    });
    updater.on('update-downloaded', (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined;
      const version = info?.version ?? this.state.availableVersion;
      // Ready-state rechecks re-verify the same staged download every cycle;
      // only log when the STAGED version actually changes so re-stagings are
      // visible in the field log without spamming it every 4h.
      if (version !== this.lastReadyVersion) {
        this.lastReadyVersion = version;
        console.log(`[Updater] Update staged: v${version ?? '?'}`);
      }
      this.set({ status: 'ready', availableVersion: version });
    });
    updater.on('error', (...args: unknown[]) => {
      const err = args[0] as Error | undefined;
      // No releases yet / offline is routine for background checks; log only.
      this.set({ status: 'error', error: err?.message ?? 'unknown error' });
      console.error('[Updater] Error:', err?.message);
    });

    const setTimeoutFn = opts.setTimeoutFn ?? setTimeout;
    const setIntervalFn = opts.setIntervalFn ?? setInterval;
    setTimeoutFn(() => this.check(), UPDATE_FIRST_CHECK_DELAY_MS);
    setIntervalFn(() => this.check(), UPDATE_CHECK_INTERVAL_MS);
  }

  check(): void {
    if (!this.autoUpdater) return;
    // Never interrupt an in-flight download. A STAGED update ('ready') must
    // NOT block checking (Auto-Update Standard rule 8): under a fast release
    // cadence the staged installer goes stale, and every restart would hop
    // the user forward ONE version instead of straight to the latest.
    // Re-checking lets electron-updater replace the staged download with the
    // newest release.
    if (this.state.status === 'downloading') return;
    dropStaleBlockmap(this.cacheDir);
    this.autoUpdater.checkForUpdates().catch((e: Error) => {
      this.set({ status: 'error', error: e.message });
      console.error('[Updater] Check failed:', e.message);
    });
  }

  /** Install the downloaded update now and relaunch. No-op unless ready. */
  installNow(): void {
    if (!this.autoUpdater || this.state.status !== 'ready') return;
    // isSilent=true: with the one-click NSIS installer this applies the
    // update with no wizard, then relaunches (Cursor-style).
    this.autoUpdater.quitAndInstall(true, true);
  }

  private set(patch: Partial<UpdaterState>): void {
    this.state = { ...this.state, error: null, ...patch };
    this.onStateChange(this.getState());
  }
}
