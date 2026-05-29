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
    person_profiles: 'identified_only',
    capture_pageview: false,
    autocapture: false,
    persistence: 'memory', // never write to localStorage — prevents quota issues on iOS WKWebView
  });
}

export type AnalyticsEvent =
  // Multiplayer
  | 'room_created'
  | 'room_joined'
  | 'multiplayer_game_hosted'    // host starts a game; include { player_count }
  // AI Judge
  | 'ai_query_sent'
  | 'ai_quota_reached'
  | 'ai_response_flagged'
  // Game lifecycle
  | 'game_ended'
  | 'game_recorded'
  // Decks
  | 'deck_saved'
  | 'deck_saved_first'           // first deck save ever — strong retention signal
  | 'deck_generated'
  | 'deck_imported'
  // Monetization
  | 'upgrade_prompt_shown'
  | 'upgrade_prompt_clicked'
  | 'subscription_started'
  | 'trial_activated'
  | 'paywall_reached'            // which gate was hit; include { feature }
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
