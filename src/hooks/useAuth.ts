/**
 * useAuth — reactive auth state + subscription tier.
 *
 * Reads the current Supabase session, fetches subscription_tier from the
 * profiles table, and caches it in localStorage for instant initial render.
 * Gracefully falls back to 'free' when Supabase is unconfigured or the
 * subscription_tier column doesn't exist yet (pre-migration).
 */

import { useState, useEffect } from 'react';
import { getCurrentUser, onAuthStateChange } from '../services/auth';
import type { AuthUser } from '../services/auth';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { STORAGE_KEYS } from '../constants/storageKeys';
import type { SubscriptionTier } from '../types/subscription';

export interface AuthState {
  user: AuthUser | null;
  tier: SubscriptionTier;
  loading: boolean;
}

function getCachedTier(): SubscriptionTier {
  const cached = localStorage.getItem(STORAGE_KEYS.SUBSCRIPTION_TIER);
  if (cached === 'pro' || cached === 'lifetime') return cached;
  return 'free';
}

async function fetchTierForUser(userId: string): Promise<SubscriptionTier> {
  if (!isSupabaseConfigured) return 'free';
  try {
    const { data } = await supabase
      .from('profiles')
      .select('subscription_tier, trial_ends_at')
      .eq('id', userId)
      .single();
    if (!data) return 'free';
    if (data.subscription_tier === 'lifetime') return 'lifetime';
    if (data.subscription_tier === 'pro') return 'pro';
    if (data.trial_ends_at && new Date(data.trial_ends_at) > new Date()) return 'pro';
    return 'free';
  } catch {
    // Column may not exist yet (pre-migration) — silently default to free
    return 'free';
  }
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    tier: getCachedTier(),
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    getCurrentUser().then(async user => {
      if (cancelled) return;
      if (user && isSupabaseConfigured) {
        const tier = await fetchTierForUser(user.id);
        if (!cancelled) {
          localStorage.setItem(STORAGE_KEYS.SUBSCRIPTION_TIER, tier);
          setState({ user, tier, loading: false });
        }
      } else {
        if (!cancelled) setState(prev => ({ ...prev, user, loading: false }));
      }
    });

    const { unsubscribe } = onAuthStateChange(user => {
      if (cancelled) return;
      setState(prev => ({ ...prev, user }));
      if (user && isSupabaseConfigured) {
        fetchTierForUser(user.id).then(tier => {
          if (!cancelled) {
            localStorage.setItem(STORAGE_KEYS.SUBSCRIPTION_TIER, tier);
            setState(prev => ({ ...prev, tier }));
          }
        });
      } else if (!user) {
        localStorage.removeItem(STORAGE_KEYS.SUBSCRIPTION_TIER);
        setState(prev => ({ ...prev, tier: 'free' }));
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}
