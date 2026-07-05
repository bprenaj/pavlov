import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  UpdaterService,
  readUpdateToken,
  readFeedConfig,
} from '../../src/main/services/updater';
import type { AutoUpdaterLike } from '../../src/main/services/updater';
import type { UpdaterState } from '../../src/shared/types';

class FakeAutoUpdater implements AutoUpdaterLike {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  logger: unknown = null;
  quitAndInstall = vi.fn();
  checkForUpdates = vi.fn<() => Promise<unknown>>().mockResolvedValue(null);
  setFeedURL = vi.fn();

  private listeners = new Map<string, ((...args: never[]) => void)[]>();

  on(event: string, listener: (...args: never[]) => void): this {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const l of this.listeners.get(event) ?? []) {
      (l as (...a: unknown[]) => void)(...args);
    }
  }
}

function makeUpdater(
  opts: {
    isPackaged?: boolean;
    getToken?: () => string | null;
    getFeed?: () => { owner: string; repo: string } | null;
  } = {},
) {
  const fake = new FakeAutoUpdater();
  const states: UpdaterState[] = [];
  const service = new UpdaterService();
  const timeouts: (() => void)[] = [];
  const intervals: (() => void)[] = [];
  service.init({
    isPackaged: opts.isPackaged ?? true,
    getAutoUpdater: () => fake,
    onStateChange: (s) => states.push(s),
    getToken: opts.getToken,
    getFeed: opts.getFeed,
    setTimeoutFn: ((fn: () => void) => {
      timeouts.push(fn);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout,
    setIntervalFn: ((fn: () => void) => {
      intervals.push(fn);
      return 0 as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval,
  });
  return { fake, states, service, timeouts, intervals };
}

describe('UpdaterService', () => {
  it('is disabled in dev (unpackaged) mode', () => {
    const service = new UpdaterService();
    const states: UpdaterState[] = [];
    service.init({
      isPackaged: false,
      getAutoUpdater: () => {
        throw new Error('should not be called in dev');
      },
      onStateChange: (s) => states.push(s),
    });
    expect(service.getState().status).toBe('disabled');
    expect(states.at(-1)?.status).toBe('disabled');
  });

  it('configures background download and install-on-quit', () => {
    const { fake } = makeUpdater();
    expect(fake.autoDownload).toBe(true);
    expect(fake.autoInstallOnAppQuit).toBe(true);
  });

  it('schedules a first check and a periodic check', () => {
    const { fake, timeouts, intervals } = makeUpdater();
    expect(timeouts.length).toBe(1);
    expect(intervals.length).toBe(1);
    timeouts[0]();
    expect(fake.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('walks idle -> checking -> downloading -> ready on the happy path', () => {
    const { fake, service } = makeUpdater();
    expect(service.getState().status).toBe('idle');

    fake.emit('checking-for-update');
    expect(service.getState().status).toBe('checking');

    fake.emit('update-available', { version: '2.0.0' });
    expect(service.getState()).toMatchObject({ status: 'downloading', availableVersion: '2.0.0' });

    fake.emit('update-downloaded', { version: '2.0.0' });
    expect(service.getState()).toMatchObject({ status: 'ready', availableVersion: '2.0.0' });
  });

  it('returns to idle when no update is available', () => {
    const { fake, service } = makeUpdater();
    fake.emit('checking-for-update');
    fake.emit('update-not-available');
    expect(service.getState()).toMatchObject({ status: 'idle', availableVersion: null });
  });

  it('records errors without crashing', () => {
    const { fake, service } = makeUpdater();
    fake.emit('error', new Error('offline'));
    expect(service.getState()).toMatchObject({ status: 'error', error: 'offline' });
  });

  it('does not re-check while downloading or ready', () => {
    const { fake, service } = makeUpdater();
    fake.emit('update-available', { version: '2.0.0' });
    service.check();
    expect(fake.checkForUpdates).not.toHaveBeenCalled();

    fake.emit('update-downloaded', { version: '2.0.0' });
    service.check();
    expect(fake.checkForUpdates).not.toHaveBeenCalled();
  });

  it('installNow only fires when an update is staged', () => {
    const { fake, service } = makeUpdater();
    service.installNow();
    expect(fake.quitAndInstall).not.toHaveBeenCalled();

    fake.emit('update-downloaded', { version: '2.0.0' });
    service.installNow();
    expect(fake.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('pushes every state change to the listener', () => {
    const { fake, states } = makeUpdater();
    fake.emit('checking-for-update');
    fake.emit('update-available', { version: '2.0.0' });
    fake.emit('update-downloaded', { version: '2.0.0' });
    expect(states.map((s) => s.status)).toEqual(['checking', 'downloading', 'ready']);
  });

  it('uses the anonymous feed when no token is present', () => {
    const { fake } = makeUpdater({ getToken: () => null });
    expect(fake.setFeedURL).not.toHaveBeenCalled();
  });

  it('authenticates the feed when a token and feed config exist (private-repo phase)', () => {
    const { fake } = makeUpdater({
      getToken: () => 'gh_pat_123',
      getFeed: () => ({ owner: 'bprenaj', repo: 'pavlov' }),
    });
    expect(fake.setFeedURL).toHaveBeenCalledWith({
      provider: 'github',
      owner: 'bprenaj',
      repo: 'pavlov',
      private: true,
      token: 'gh_pat_123',
    });
  });

  it('falls back to anonymous when token exists but feed config is unreadable', () => {
    const { fake } = makeUpdater({ getToken: () => 'gh_pat_123', getFeed: () => null });
    expect(fake.setFeedURL).not.toHaveBeenCalled();
  });
});

describe('update token and feed config readers', () => {
  it('readUpdateToken returns trimmed token or null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pavlov-upd-'));
    expect(readUpdateToken(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, 'update-token.txt'), '  gh_pat_456 \n');
    expect(readUpdateToken(dir)).toBe('gh_pat_456');
    fs.writeFileSync(path.join(dir, 'update-token.txt'), '   \n');
    expect(readUpdateToken(dir)).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('readFeedConfig parses owner/repo from app-update.yml', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pavlov-feed-'));
    expect(readFeedConfig(dir)).toBeNull();
    fs.writeFileSync(
      path.join(dir, 'app-update.yml'),
      'owner: bprenaj\nrepo: pavlov\nprovider: github\nupdaterCacheDirName: pavlov-updater\n',
    );
    expect(readFeedConfig(dir)).toEqual({ owner: 'bprenaj', repo: 'pavlov' });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
