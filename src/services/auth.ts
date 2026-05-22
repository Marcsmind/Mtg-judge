/**
 * Supabase Auth helpers — anonymous-first, optional Google upgrade.
 *
 * Call initAuth() once on app mount. All other helpers are safe to call
 * even when Supabase is not configured (they return null/no-op).
 */

import { supabase, isSupabaseConfigured } from "./supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  isAnonymous: boolean;
  email?: string;
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
