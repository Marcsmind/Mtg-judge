/**
 * useFeature — returns true if the current user's subscription tier
 * grants access to the named feature.
 *
 * All feature flags default to true (open) until Stripe is wired up and
 * the PRO_FEATURES set is finalized. Flip a feature into PRO_FEATURES when
 * its gate is ready to be enforced.
 *
 * Usage:
 *   const canHostPod = useFeature('host_multiplayer_pod');
 *   if (!canHostPod) return <UpgradePrompt />;
 */

import { useAuth } from './useAuth';
import type { FeatureName, SubscriptionTier } from '../types/subscription';

const PRO_FEATURES: ReadonlySet<FeatureName> = new Set<FeatureName>([
  'host_multiplayer_pod',
  'unlimited_ai',
  'cloud_decks',
  'full_game_history',
  'ai_deck_generation',
  'card_scanner',
]);

function tierHasFeature(tier: SubscriptionTier, feature: FeatureName): boolean {
  if (!PRO_FEATURES.has(feature)) return true;
  return tier === 'pro' || tier === 'lifetime';
}

export function useFeature(feature: FeatureName): boolean {
  const { tier } = useAuth();
  return tierHasFeature(tier, feature);
}
