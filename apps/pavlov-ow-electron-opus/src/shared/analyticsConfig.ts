/**
 * PostHog project configuration.
 *
 * The project API key is a WRITE-ONLY ingestion key -- safe to commit and ship
 * in the client (it cannot read data back). To go live:
 *   1. Create a free project at https://posthog.com (pick EU or US host).
 *   2. Paste the Project API key and host URL below.
 *
 * While POSTHOG_KEY is empty (or left as the placeholder), analytics stays
 * fully inert: the service never initializes and nothing is ever sent. This
 * lets everything build, test, and ship before the key exists.
 */

export const POSTHOG_KEY = '';
export const POSTHOG_HOST = 'https://us.i.posthog.com';

export function isAnalyticsConfigured(): boolean {
  return POSTHOG_KEY.trim().length > 0;
}
