/**
 * Analytics — PostHog wrapper with typed event names.
 *
 * Initializes automatically when VITE_POSTHOG_KEY is set.
 * All calls are no-ops when the key is absent (local dev, self-hosted).
 *
 * Setup: sign up at posthog.com, copy the project API key,
 * add VITE_POSTHOG_KEY to your .env and Netlify environment variables.
 */

import posthog from 'posthog-js';

const posthogKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: 'https://us.i.posthog.com',
    person_profiles: 'identified_only', // only create person profiles for identified users
    capture_pageview: false,            // SPA — tabs fire custom events instead
    autocapture: false,                 // too noisy; track explicit events only
  });
}

export type AnalyticsEvent =
  // Multiplayer
  | 'room_created'
  | 'room_joined'
  // AI Judge
  | 'ai_query_sent'
  | 'ai_quota_reached'
  // Game lifecycle
  | 'game_ended'
  | 'game_recorded'
  // Decks
  | 'deck_saved'
  | 'deck_generated'
  | 'deck_imported'
  // Monetization
  | 'upgrade_prompt_shown'
  | 'upgrade_prompt_clicked'
  | 'subscription_started'
  // Auth
  | 'account_created'
  | 'account_signed_in'
  | 'feature_gated';

export function track(event: AnalyticsEvent, properties?: Record<string, unknown>): void {
  if (!posthogKey) return;
  posthog.capture(event, properties);
}

export function identify(userId: string, properties?: Record<string, unknown>): void {
  if (!posthogKey) return;
  posthog.identify(userId, properties);
}

export function analyticsReset(): void {
  if (!posthogKey) return;
  posthog.reset();
}
