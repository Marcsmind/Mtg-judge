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
  trialEndsAt: string | null;
  loading: boolean;
}

function getCachedTier(): SubscriptionTier {
  const cached = localStorage.getItem(STORAGE_KEYS.SUBSCRIPTION_TIER);
  if (cached === 'pro' || cached === 'lifetime') return cached;
  return 'free';
}

async function fetchProfileForUser(userId: string): Promise<{ tier: SubscriptionTier; trialEndsAt: string | null }> {
  if (!isSupabaseConfigured) return { tier: 'free', trialEndsAt: null };
  try {
    const { data } = await supabase
      .from('profiles')
      .select('subscription_tier, trial_ends_at')
      .eq('id', userId)
      .single();
    if (!data) return { tier: 'free', trialEndsAt: null };
    const trialEndsAt: string | null = data.trial_ends_at ?? null;
    if (data.subscription_tier === 'lifetime') return { tier: 'lifetime', trialEndsAt };
    if (data.subscription_tier === 'pro') return { tier: 'pro', trialEndsAt };
    if (trialEndsAt && new Date(trialEndsAt) > new Date()) return { tier: 'pro', trialEndsAt };
    return { tier: 'free', trialEndsAt };
  } catch {
    return { tier: 'free', trialEndsAt: null };
  }
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    tier: getCachedTier(),
    trialEndsAt: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    getCurrentUser().then(async user => {
      if (cancelled) return;
      if (user && isSupabaseConfigured) {
        const { tier, trialEndsAt } = await fetchProfileForUser(user.id);
        if (!cancelled) {
          localStorage.setItem(STORAGE_KEYS.SUBSCRIPTION_TIER, tier);
          setState({ user, tier, trialEndsAt, loading: false });
        }
      } else {
        if (!cancelled) setState(prev => ({ ...prev, user, loading: false }));
      }
    });

    const { unsubscribe } = onAuthStateChange(user => {
      if (cancelled) return;
      setState(prev => ({ ...prev, user }));
      if (user && isSupabaseConfigured) {
        fetchProfileForUser(user.id).then(({ tier, trialEndsAt }) => {
          if (!cancelled) {
            localStorage.setItem(STORAGE_KEYS.SUBSCRIPTION_TIER, tier);
            setState(prev => ({ ...prev, tier, trialEndsAt }));
          }
        });
      } else if (!user) {
        localStorage.removeItem(STORAGE_KEYS.SUBSCRIPTION_TIER);
        setState(prev => ({ ...prev, tier: 'free', trialEndsAt: null }));
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}
