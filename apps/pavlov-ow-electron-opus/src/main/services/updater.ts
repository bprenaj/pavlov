import * as fs from 'fs';
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

export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  logger?: unknown;
  on(event: string, listener: (...args: never[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  setFeedURL?(options: Record<string, unknown>): void;
}

/**
 * Private-repo phase support (same scheme as There Is No Mouse): a GitHub
 * fine-grained PAT in <userData>/update-token.txt authenticates release
 * lookups. No token file = anonymous checks (correct for public repos).
 * When a private repo goes public, delete the token file; no code change.
 */
export function readUpdateToken(userDataDir: string): string | null {
  try {
    const token = fs.readFileSync(path.join(userDataDir, 'update-token.txt'), 'utf8').trim();
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Owner/repo from the packaged resources/app-update.yml. Do NOT read
 * package.json build.publish at runtime: electron-builder strips the
 * "build" key from the packaged app.
 */
export function readFeedConfig(resourcesPath: string): { owner: string; repo: string } | null {
  try {
    const raw = fs.readFileSync(path.join(resourcesPath, 'app-update.yml'), 'utf8');
    const owner = /^owner:\s*(.+)$/m.exec(raw);
    const repo = /^repo:\s*(.+)$/m.exec(raw);
    if (owner && repo) return { owner: owner[1].trim(), repo: repo[1].trim() };
  } catch {
    /* fall through */
  }
  return null;
}

export interface UpdaterOptions {
  /** false in dev -- updater stays disabled */
  isPackaged: boolean;
  /** lazily provides the electron-updater instance (not loaded in dev/tests) */
  getAutoUpdater: () => AutoUpdaterLike;
  /** called whenever state changes, e.g. push to renderer + tray */
  onStateChange: (state: UpdaterState) => void;
  /** private-repo phase seams; both default to null (anonymous feed) */
  getToken?: () => string | null;
  getFeed?: () => { owner: string; repo: string } | null;
  /** scheduling seams, default to real timers */
  setTimeoutFn?: typeof setTimeout;
  setIntervalFn?: typeof setInterval;
}

export class UpdaterService {
  private state: UpdaterState = { status: 'idle', availableVersion: null, error: null };
  private autoUpdater: AutoUpdaterLike | null = null;
  private onStateChange: (state: UpdaterState) => void = () => {};

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
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;

    const token = opts.getToken?.() ?? null;
    if (token && updater.setFeedURL) {
      const feed = opts.getFeed?.() ?? null;
      if (feed) {
        updater.setFeedURL({
          provider: 'github',
          owner: feed.owner,
          repo: feed.repo,
          private: true,
          token,
        });
        console.log(`[Updater] Authenticated feed (private repo ${feed.owner}/${feed.repo})`);
      } else {
        console.error('[Updater] update token present but app-update.yml unreadable; using anonymous feed');
      }
    }
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
    updater.on('update-downloaded', (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined;
      this.set({ status: 'ready', availableVersion: info?.version ?? this.state.availableVersion });
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
    // Don't restart a check while a download is in flight or staged.
    if (this.state.status === 'downloading' || this.state.status === 'ready') return;
    this.autoUpdater.checkForUpdates().catch((e: Error) => {
      this.set({ status: 'error', error: e.message });
      console.error('[Updater] Check failed:', e.message);
    });
  }

  /** Install the downloaded update now and relaunch. No-op unless ready. */
  installNow(): void {
    if (!this.autoUpdater || this.state.status !== 'ready') return;
    this.autoUpdater.quitAndInstall(false, true);
  }

  private set(patch: Partial<UpdaterState>): void {
    this.state = { ...this.state, error: null, ...patch };
    this.onStateChange(this.getState());
  }
}
