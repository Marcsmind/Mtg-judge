/**
 * Supabase Auth helpers — anonymous-first, optional Google upgrade.
 *
 * Call initAuth() once on app mount. All other helpers are safe to call
 * even when Supabase is not configured (they return null/no-op).
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { STORAGE_KEYS } from "../constants/storageKeys";

// Detect Capacitor native runtime at module load time
const isNative = typeof (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === 'function'
  && (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor!.isNativePlatform!();

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
      isAnonymous: session.user.is_anonymous ?? false,
      email: session.user.email ?? undefined,
    };
  }

  // Use URLSearchParams for exact parameter matching — string.includes('code=')
  // would incorrectly match 'error_code=' from OAuth error redirect URLs.
  const qp = new URLSearchParams(window.location.search);
  const hp = new URLSearchParams(window.location.hash.slice(1));
  const hasOAuthCallback =
    qp.has('code') ||              // PKCE success
    hp.has('access_token') ||      // implicit success
    qp.has('error') ||             // OAuth error in query string
    hp.has('error');               // OAuth error in hash

  if (hasOAuthCallback) {
    // Don't create an anonymous session while Supabase is processing an
    // OAuth callback (success or error). onAuthStateChange will fire once
    // the exchange completes; App.tsx handles the error display.
    return null;
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
    isAnonymous: session.user.is_anonymous ?? false,
    email: session.user.email ?? undefined,
  };
}

/**
 * Sign in with Apple.
 *
 * Native iOS: uses the system Sign in with Apple dialog (Face ID / Touch ID)
 * via @capacitor-community/apple-sign-in + supabase.auth.signInWithIdToken.
 * This avoids SFSafariViewController entirely — no browser, no redirect loop.
 *
 * Web: falls back to Supabase OAuth (browser redirect), same as Google.
 */
export async function signInWithApple(): Promise<void> {
  if (!isSupabaseConfigured) return;

  if (isNative) {
    const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
    const rawNonce = crypto.randomUUID();
    // Apple expects a SHA-256 hex hash of the nonce in the authorize call.
    // Supabase receives the raw nonce and hashes it to verify against the JWT.
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawNonce));
    const hashedNonce = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
    let identityToken: string;
    try {
      const { response } = await SignInWithApple.authorize({
        clientId: "com.nexusjudge.app",
        redirectURI: "https://rfdrvwyfjylwekbticzu.supabase.co/auth/v1/callback",
        scopes: "email name",
        nonce: hashedNonce,
      });
      if (!response.identityToken) {
        console.error("[auth] signInWithApple: no identityToken");
        return;
      }
      identityToken = response.identityToken;
    } catch (e) {
      // Silently ignore user cancellations
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("dismissed")) {
        console.error("[auth] signInWithApple native failed:", e);
        alert("Apple Sign-In failed. Please try again.");
      }
      return;
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: identityToken,
      nonce: rawNonce,
    });

    if (!error) return;

    // identity_already_exists means this Apple account is linked to an existing
    // user but we're currently in an anonymous session — sign out and retry.
    if (error.message?.includes("identity_already_exists") || (error as { code?: string }).code === "identity_already_exists") {
      await supabase.auth.signOut();
      const { error: retryError } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: identityToken,
        nonce: rawNonce,
      });
      if (retryError) {
        console.error("[auth] signInWithIdToken retry failed:", retryError.message);
        alert(`Apple Sign-In failed: ${retryError.message}`);
      }
      return;
    }

    console.error("[auth] signInWithIdToken apple failed:", error.message);
    alert(`Apple Sign-In failed: ${error.message}`);
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  const isAnon = session?.user?.is_anonymous === true;
  const webOpts = { redirectTo: `${window.location.origin}/` };
  const { error } = isAnon
    ? await supabase.auth.linkIdentity({ provider: "apple", options: webOpts })
    : await supabase.auth.signInWithOAuth({ provider: "apple", options: webOpts });
  if (error) console.error("[auth] signInWithApple failed:", error.message);
}

/**
 * Sign in with Google. If the caller has an anonymous session, upgrades it via
 * linkIdentity so their user ID and data are preserved. Otherwise does a fresh
 * signInWithOAuth (handles both new sign-ups and returning Google users).
 */
export async function signInWithGoogle(forceFresh = false): Promise<void> {
  if (!isSupabaseConfigured) return;

  const { data: { session } } = await supabase.auth.getSession();
  const isAnon = !forceFresh && session?.user?.is_anonymous === true;

  if (isNative) {
    const nativeOpts = { redirectTo: "com.nexusjudge.app://auth/callback", skipBrowserRedirect: true as const, ...(isAnon ? { queryParams: { prompt: "select_account" } } : {}) };
    const { data, error } = isAnon
      ? await supabase.auth.linkIdentity({ provider: "google", options: nativeOpts })
      : await supabase.auth.signInWithOAuth({ provider: "google", options: nativeOpts });
    if (error) { console.error("[auth] signInWithGoogle failed:", error.message); return; }
    const url = (data as { url?: string })?.url;
    if (url) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
    }
    return;
  }

  const webOpts = { redirectTo: `${window.location.origin}/`, ...(isAnon ? { queryParams: { prompt: "select_account" } } : {}) };
  const { error } = isAnon
    ? await supabase.auth.linkIdentity({ provider: "google", options: webOpts })
    : await supabase.auth.signInWithOAuth({ provider: "google", options: webOpts });
  if (error) console.error("[auth] signInWithGoogle failed:", error.message);
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
 * Permanently delete the current user's account and all associated data.
 * Calls the `delete_user` Postgres RPC (SECURITY DEFINER) which removes the
 * auth.users row; ON DELETE CASCADE cleans up profiles, decks, and game history.
 * Returns an error string on failure, null on success.
 */
export async function deleteAccount(): Promise<string | null> {
  if (!isSupabaseConfigured) return 'Supabase not configured.';
  const { error } = await supabase.rpc('delete_user');
  if (error) return error.message;
  await supabase.auth.signOut();
  return null;
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
        isAnonymous: session.user.is_anonymous ?? false,
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
/** Returns true if the trial was freshly activated, false if already set. */
export async function activateTrial(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { data } = await supabase
    .from('profiles')
    .select('trial_ends_at')
    .eq('id', userId)
    .single();
  if (data?.trial_ends_at) return false; // already set — don't reset
  const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('profiles').upsert(
    { id: userId, display_name: 'Player', trial_ends_at: trialEnd, updated_at: new Date().toISOString() },
    { onConflict: 'id' },
  );
  return true;
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
