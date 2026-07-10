import { describe, it, expect, vi } from 'vitest';
import { UpdaterService } from '../../src/main/services/updater';
import type { AutoUpdaterLike } from '../../src/main/services/updater';
import type { UpdaterState } from '../../src/shared/types';

class FakeAutoUpdater implements AutoUpdaterLike {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  logger: unknown = null;
  quitAndInstall = vi.fn();
  checkForUpdates = vi.fn<() => Promise<unknown>>().mockResolvedValue(null);

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

function makeUpdater(opts: { isPackaged?: boolean } = {}) {
  const fake = new FakeAutoUpdater();
  const states: UpdaterState[] = [];
  const service = new UpdaterService();
  const timeouts: (() => void)[] = [];
  const intervals: (() => void)[] = [];
  service.init({
    isPackaged: opts.isPackaged ?? true,
    getAutoUpdater: () => fake,
    onStateChange: (s) => states.push(s),
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

  it('recovers to idle when a download is cancelled, so checks resume', () => {
    const { fake, service } = makeUpdater();
    fake.emit('update-available', { version: '2.0.0' });
    expect(service.getState().status).toBe('downloading');

    fake.emit('update-cancelled');
    expect(service.getState()).toMatchObject({ status: 'idle', availableVersion: null });

    service.check();
    expect(fake.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('keeps checking after an error state', () => {
    const { fake, service } = makeUpdater();
    fake.emit('error', new Error('offline'));
    expect(service.getState().status).toBe('error');
    service.check();
    expect(fake.checkForUpdates).toHaveBeenCalledTimes(1);
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
});
