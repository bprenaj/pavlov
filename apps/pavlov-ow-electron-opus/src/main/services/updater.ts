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
  allowPrerelease: boolean;
  channel: string | null;
  logger?: unknown;
  on(event: string, listener: (...args: never[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export type UpdateChannel = 'latest' | 'beta';

/**
 * Beta installs (version like 1.0.4-beta.7, published by the beta workflow)
 * follow the beta feed and keep updating themselves as new betas ship.
 * Stable installs never see prereleases.
 */
export function channelForVersion(version: string): UpdateChannel {
  return /-beta(\.|$)/.test(version) ? 'beta' : 'latest';
}

export interface UpdaterOptions {
  /** false in dev -- updater stays disabled */
  isPackaged: boolean;
  /** lazily provides the electron-updater instance (not loaded in dev/tests) */
  getAutoUpdater: () => AutoUpdaterLike;
  /** called whenever state changes, e.g. push to renderer + tray */
  onStateChange: (state: UpdaterState) => void;
  /** update feed to follow; derive from the app version via channelForVersion */
  channel?: UpdateChannel;
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
    // Set both explicitly: electron-updater defaults allowPrerelease from the
    // app's own version, and we want the choice to be deterministic.
    const channel = opts.channel ?? 'latest';
    updater.channel = channel;
    updater.allowPrerelease = channel === 'beta';
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
