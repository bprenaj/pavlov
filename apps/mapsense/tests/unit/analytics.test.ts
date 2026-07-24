import { describe, it, expect, vi } from 'vitest';
import {
  AnalyticsService,
  sanitizeProps,
  isKnownEvent,
} from '../../src/main/services/analytics';
import type { PostHogClientLike } from '../../src/main/services/analytics';

class FakeClient implements PostHogClientLike {
  captures: { distinctId: string; event: string; properties?: Record<string, unknown> }[] = [];
  capture(payload: { distinctId: string; event: string; properties?: Record<string, unknown> }): void {
    this.captures.push(payload);
  }
  flush = vi.fn();
  shutdown = vi.fn();
}

function makeService(
  opts: {
    isPackaged?: boolean;
    isConfigured?: boolean;
    optedOut?: boolean;
    consentBlocked?: boolean;
  } = {},
) {
  const client = new FakeClient();
  const service = new AnalyticsService();
  service.init({
    isPackaged: opts.isPackaged ?? true,
    isConfigured: opts.isConfigured ?? true,
    installId: 'install-abc',
    optedOut: opts.optedOut ?? false,
    consentBlocked: opts.consentBlocked ?? false,
    baseProps: { appVersion: '1.0.0', osPlatform: 'win32' },
    getClient: () => client,
  });
  return { client, service };
}

describe('sanitizeProps', () => {
  it('keeps only allowlisted primitive properties', () => {
    const out = sanitizeProps({
      masScore: 74,
      trainingMode: 'paid',
      appVersion: '1.0.0',
    });
    expect(out).toEqual({ masScore: 74, trainingMode: 'paid', appVersion: '1.0.0' });
  });

  it('strips gaze coordinates, region rect, file paths, and webhook URLs', () => {
    const out = sanitizeProps({
      gazeX: 1234,
      gazeY: 567,
      minimapRect: { x: 1, y: 2, width: 3, height: 4 },
      customSoundPath: 'C:/Users/velok/secret.wav',
      irlWebhookUrl: 'http://192.168.1.50/alert',
      masScore: 80,
    });
    expect(out).toEqual({ masScore: 80 });
    expect(Object.keys(out)).not.toContain('gazeX');
    expect(Object.keys(out)).not.toContain('minimapRect');
    expect(Object.keys(out)).not.toContain('customSoundPath');
    expect(Object.keys(out)).not.toContain('irlWebhookUrl');
  });

  it('drops non-primitive values even for allowlisted keys', () => {
    const out = sanitizeProps({ masScore: { nested: 1 } as unknown as number });
    expect(out).toEqual({});
  });
});

describe('isKnownEvent', () => {
  it('accepts allowlisted events and rejects unknown ones', () => {
    expect(isKnownEvent('session_complete')).toBe(true);
    expect(isKnownEvent('training_started')).toBe(true);
    expect(isKnownEvent('gaze_sample')).toBe(false);
    expect(isKnownEvent('arbitrary_event')).toBe(false);
  });
});

describe('AnalyticsService', () => {
  it('captures allowlisted events with sanitized props + base props', () => {
    const { client, service } = makeService();
    service.capture('session_complete', {
      masScore: 74,
      gazeX: 999, // must be stripped
    });
    expect(client.captures).toHaveLength(1);
    expect(client.captures[0]).toMatchObject({
      distinctId: 'install-abc',
      event: 'session_complete',
      properties: { masScore: 74, appVersion: '1.0.0', osPlatform: 'win32' },
    });
    expect(client.captures[0].properties).not.toHaveProperty('gazeX');
  });

  it('drops unknown event names', () => {
    const { client, service } = makeService();
    service.capture('gaze_sample', { gazeX: 1 });
    expect(client.captures).toHaveLength(0);
  });

  it('is disabled in dev (unpackaged) - never builds a client', () => {
    const { client, service } = makeService({ isPackaged: false });
    service.capture('app_opened');
    expect(client.captures).toHaveLength(0);
    expect(service.isEnabled()).toBe(false);
  });

  it('is disabled when no PostHog key is configured', () => {
    const { client, service } = makeService({ isConfigured: false });
    service.capture('app_opened');
    expect(client.captures).toHaveLength(0);
    expect(service.isEnabled()).toBe(false);
  });

  it('sends nothing while opted out, resumes when opt-out is cleared', () => {
    const { client, service } = makeService({ optedOut: true });
    service.capture('app_opened');
    expect(client.captures).toHaveLength(0);
    service.setOptedOut(false);
    service.capture('app_opened');
    expect(client.captures).toHaveLength(1);
  });

  it('stays off when consent is blocked', () => {
    const { client, service } = makeService({ consentBlocked: true });
    service.capture('app_opened');
    expect(client.captures).toHaveLength(0);
  });

  it('flushes and shuts down the client', async () => {
    const { client, service } = makeService();
    await service.flush();
    expect(client.flush).toHaveBeenCalled();
    await service.shutdown();
    expect(client.shutdown).toHaveBeenCalled();
    expect(service.isEnabled()).toBe(false);
  });
});
