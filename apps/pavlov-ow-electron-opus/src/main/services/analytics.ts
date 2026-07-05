import {
  ANALYTICS_EVENTS,
  ANALYTICS_SAFE_PROPS,
} from '../../shared/constants';
import type { AnalyticsEvent } from '../../shared/constants';

/**
 * Anonymous product analytics for Pavlov, sent from the MAIN process only
 * (the renderer CSP forbids remote SDKs). PostHog is the backend, but every
 * event passes through this service's two guards first:
 *
 *   1. Event allowlist  -- unknown event names are dropped.
 *   2. Property sanitizer -- only ANALYTICS_SAFE_PROPS keys survive, so any
 *      sensitive field (eye position, screen region, local paths, device
 *      URLs) can never be sent even if a caller passes it by mistake.
 *
 * Enabled only when: packaged AND configured (key present) AND the user has
 * not opted out AND consent is satisfied (CMP not required, or granted).
 * Opt-out is the consent model: anonymous analytics is on by default.
 *
 * DI-testable like UpdaterService: the PostHog client and gating inputs are
 * injected, so the guards run without Electron or network.
 */

export interface PostHogClientLike {
  capture(payload: { distinctId: string; event: string; properties?: Record<string, unknown> }): void;
  flush(): Promise<unknown> | void;
  shutdown(): Promise<unknown> | void;
}

export interface AnalyticsOptions {
  /** false in dev -- analytics stays off */
  isPackaged: boolean;
  /** false until a PostHog project key is configured */
  isConfigured: boolean;
  /** anonymous UUID distinct-id */
  installId: string;
  /** lazily builds the PostHog client (never imported in dev/tests) */
  getClient: () => PostHogClientLike;
  /** true when the user has opted out of anonymous analytics */
  optedOut: boolean;
  /** true only if CMP consent is required AND not yet granted (then stay off) */
  consentBlocked?: boolean;
  /** static props merged into every event (appVersion, osPlatform) */
  baseProps?: Partial<Record<(typeof ANALYTICS_SAFE_PROPS)[number], unknown>>;
}

const EVENT_SET = new Set<string>(ANALYTICS_EVENTS);
const SAFE_PROP_SET = new Set<string>(ANALYTICS_SAFE_PROPS);

/** Keep only allowlisted, primitive-valued properties. */
export function sanitizeProps(props: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!SAFE_PROP_SET.has(key)) continue;
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') out[key] = value;
  }
  return out;
}

export function isKnownEvent(event: string): event is AnalyticsEvent {
  return EVENT_SET.has(event);
}

export class AnalyticsService {
  private client: PostHogClientLike | null = null;
  private installId = '';
  private optedOut = false;
  private consentBlocked = false;
  private baseProps: Record<string, unknown> = {};

  init(opts: AnalyticsOptions): void {
    this.installId = opts.installId;
    this.optedOut = opts.optedOut;
    this.consentBlocked = opts.consentBlocked ?? false;
    this.baseProps = sanitizeProps((opts.baseProps as Record<string, unknown>) ?? {});

    if (!opts.isPackaged || !opts.isConfigured) {
      console.log('[Analytics] disabled (dev build or no key configured)');
      return;
    }
    try {
      this.client = opts.getClient();
    } catch (e: unknown) {
      console.error('[Analytics] client init failed:', (e as Error).message);
      this.client = null;
    }
  }

  /** Live opt-out flip from the settings toggle. */
  setOptedOut(optedOut: boolean): void {
    this.optedOut = optedOut;
  }

  setConsentBlocked(blocked: boolean): void {
    this.consentBlocked = blocked;
  }

  isEnabled(): boolean {
    return this.client !== null && !this.optedOut && !this.consentBlocked;
  }

  capture(event: string, props: Record<string, unknown> = {}): void {
    if (!this.isEnabled() || !isKnownEvent(event)) return;
    this.client!.capture({
      distinctId: this.installId,
      event,
      properties: { ...this.baseProps, ...sanitizeProps(props) },
    });
  }

  async flush(): Promise<void> {
    try {
      await this.client?.flush();
    } catch {
      /* best effort */
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.client?.shutdown();
    } catch {
      /* best effort */
    }
    this.client = null;
  }
}
