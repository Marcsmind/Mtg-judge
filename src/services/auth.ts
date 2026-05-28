/**
 * Supabase Auth helpers — anonymous-first, optional Google upgrade.
 *
 * Call initAuth() once on app mount. All other helpers are safe to call
 * even when Supabase is not configured (they return null/no-op).
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { STORAGE_KEYS } from "../constants/storageKeys";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  isAnonymous: boolean;
  email?: string;
}

export interface AuthResult {
  user: AuthUser | null;
  error: string | null;
}

// ── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Sign in anonymously if there is no active session.
 * Call once on app mount — safe to call multiple times.
 */
export async function initAuth(): Promise<AuthUser | null> {
  if (!isSupabaseConfigured) return null;

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    return {
      id: session.user.id,
      isAnonymous: session.user.is_anonymous ?? true,
      email: session.user.email ?? undefined,
    };
  }

  // No session — create an anonymous one (zero friction, no email required)
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    console.error("[auth] signInAnonymously failed:", error?.message);
    return null;
  }

  return { id: data.user.id, isAnonymous: true };
}

/** Get the active session user, or null if not signed in. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isSupabaseConfigured) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  return {
    id: session.user.id,
    isAnonymous: session.user.is_anonymous ?? true,
    email: session.user.email ?? undefined,
  };
}

/**
 * Upgrade the current anonymous session to a Google account.
 * Supabase merges history automatically — the same user_id is preserved,
 * so all existing game_participants rows remain linked.
 * This triggers a browser redirect to Google OAuth.
 */
export async function linkGoogleAccount(): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) console.error("[auth] linkIdentity failed:", error.message);
}

/**
 * Sign up with email + password.
 *
 * If the caller is currently signed in anonymously, upgrades that session
 * to a permanent email account (preserving user ID and all history) via
 * updateUser. Otherwise creates a fresh account via signUp.
 *
 * Returns `user` when the caller is immediately signed in (anonymous upgrade
 * or signUp without email confirmation). Returns `user: null, error: null`
 * when a confirmation email was sent and the user must confirm before signing in.
 */
export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!isSupabaseConfigured) return { user: null, error: 'Supabase not configured.' };

  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user?.is_anonymous) {
    // Upgrade anonymous → email account; preserves the same user ID
    const { data, error } = await supabase.auth.updateUser({ email, password });
    if (error) return { user: null, error: error.message };
    if (!data.user) return { user: null, error: 'Account setup failed. Please try again.' };
    await activateTrial(data.user.id);
    return {
      user: { id: data.user.id, isAnonymous: false, email: data.user.email ?? undefined },
      error: null,
    };
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { user: null, error: error.message };
  if (!data.user) return { user: null, error: 'Account setup failed. Please try again.' };
  await activateTrial(data.user.id);
  // data.session is null when email confirmation is required before sign-in
  if (!data.session) return { user: null, error: null };
  return {
    user: { id: data.user.id, isAnonymous: false, email: data.user.email ?? undefined },
    error: null,
  };
}

/** Sign in with email + password. */
export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!isSupabaseConfigured) return { user: null, error: 'Supabase not configured.' };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: error.message };
  if (!data.user) return { user: null, error: 'Sign in failed. Please try again.' };
  return {
    user: { id: data.user.id, isAnonymous: false, email: data.user.email ?? undefined },
    error: null,
  };
}

/**
 * Send a password reset email. The link redirects to /reset-password
 * where you can complete the reset flow.
 */
export async function resetPassword(email: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: 'Supabase not configured.' };
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) return { error: error.message };
  return { error: null };
}

/** Sign out and clear the local session. */
export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
}

/**
 * Subscribe to auth state changes.
 * Returns an object with an `unsubscribe()` method.
 */
export function onAuthStateChange(
  callback: (user: AuthUser | null) => void,
): { unsubscribe: () => void } {
  if (!isSupabaseConfigured) return { unsubscribe: () => undefined };

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      callback({
        id: session.user.id,
        isAnonymous: session.user.is_anonymous ?? true,
        email: session.user.email ?? undefined,
      });
    } else {
      callback(null);
    }
  });

  return { unsubscribe: () => data.subscription.unsubscribe() };
}

// ── Trial ─────────────────────────────────────────────────────────────────────

/**
 * Set trial_ends_at to 14 days from now for a newly-created account.
 * No-ops if the profile already has a trial_ends_at value (prevents
 * resetting the trial on repeated sign-ins).
 */
export async function activateTrial(userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { data } = await supabase
    .from('profiles')
    .select('trial_ends_at')
    .eq('id', userId)
    .single();
  if (data?.trial_ends_at) return; // already set — don't reset
  const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('profiles').upsert(
    { id: userId, display_name: 'Player', trial_ends_at: trialEnd, updated_at: new Date().toISOString() },
    { onConflict: 'id' },
  );
}

// ── Profile ───────────────────────────────────────────────────────────────────

/**
 * Upsert a profile row for the current user.
 * Idempotent — safe to call on every sign-in or name change.
 */
export async function upsertProfile(
  userId: string,
  displayName: string,
  avatarEmoji = "",
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from("profiles").upsert(
    { id: userId, display_name: displayName.trim() || "Player", avatar_emoji: avatarEmoji, updated_at: new Date().toISOString() },
    { onConflict: "id" },
  );
  if (error) console.error("[auth] upsertProfile failed:", error.message);
}

/** Fetch the display name stored in `profiles` for a user. */
export async function getDisplayName(userId: string): Promise<string> {
  if (!isSupabaseConfigured) return "Player";
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .single();
  return data?.display_name ?? "Player";
}

// ── Device identity ───────────────────────────────────────────────────────────

/**
 * Returns a stable random UUID for this device.
 * Generated once and persisted in localStorage — survives page reloads,
 * does NOT survive localStorage clear. Used as a unique device identifier
 * during the multiplayer lobby phase.
 */
export function getDeviceId(): string {
  let id = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
  if (!id) {
    id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'device-' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem(STORAGE_KEYS.DEVICE_ID, id);
  }
  return id;
}
