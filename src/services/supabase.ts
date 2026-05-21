import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// If env vars are not set the client is initialised with empty strings.
// Multiplayer features check `isSupabaseConfigured` and show a graceful
// "not configured" message rather than crashing.
export const supabase = createClient(supabaseUrl ?? "", supabaseKey ?? "");

export const isSupabaseConfigured =
  Boolean(supabaseUrl?.trim()) && Boolean(supabaseKey?.trim());
export const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
