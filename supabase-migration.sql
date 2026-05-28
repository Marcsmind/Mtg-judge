-- ============================================================
-- Nexus Judge — Leaderboard Schema
-- Run this in your Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. Profiles ──────────────────────────────────────────────
-- One row per authenticated user. Display name shown on leaderboard.

create table if not exists public.profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  display_name text        not null default 'Player',
  avatar_emoji text        not null default '',
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Anyone can read profiles (needed for leaderboard)
create policy "profiles: public read"
  on public.profiles for select using (true);

-- Users can only write their own profile
create policy "profiles: own insert"
  on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: own update"
  on public.profiles for update using (auth.uid() = id);

-- ── 2. Game Sessions ─────────────────────────────────────────
-- One row per completed game.

create table if not exists public.game_sessions (
  id            uuid        primary key default gen_random_uuid(),
  room_code     text,                          -- null for local games
  player_count  int         not null,
  starting_life int         not null,
  duration_secs int         not null default 0,
  completed_at  timestamptz not null default now()
);

alter table public.game_sessions enable row level security;

create policy "game_sessions: public read"
  on public.game_sessions for select using (true);

create policy "game_sessions: authenticated insert"
  on public.game_sessions for insert with check (auth.uid() is not null);

-- ── 3. Game Participants ─────────────────────────────────────
-- One row per player per game.

create table if not exists public.game_participants (
  id          uuid        primary key default gen_random_uuid(),
  game_id     uuid        not null references public.game_sessions(id) on delete cascade,
  user_id     uuid        references auth.users(id),  -- null = unlinked player
  player_name text        not null,
  final_life  int         not null default 0,
  is_winner   boolean     not null default false,
  created_at  timestamptz not null default now()
);

alter table public.game_participants enable row level security;

create policy "game_participants: public read"
  on public.game_participants for select using (true);

create policy "game_participants: authenticated insert"
  on public.game_participants for insert with check (auth.uid() is not null);

-- ── 4. Multiplayer — Commander Name ─────────────────────────
-- Adds the commander_name column to existing game_participants rows.
-- Safe to run multiple times (IF NOT EXISTS guard).

ALTER TABLE public.game_participants
  ADD COLUMN IF NOT EXISTS commander_name text;

-- ── 5. Subscription Tier ────────────────────────────────────────
-- Adds monetization columns to profiles (safe to run on existing data).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- ── 6. AI Usage Quota ────────────────────────────────────────────
-- Tracks per-IP daily question counts for the shared Gemini proxy key.
-- Used by netlify/functions/gemini-proxy.ts to enforce the 5/day free limit.

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_hash   TEXT    NOT NULL,
  date        DATE    NOT NULL DEFAULT CURRENT_DATE,
  count       INT     NOT NULL DEFAULT 0,
  UNIQUE (user_hash, date)
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage: anon read"
  ON public.ai_usage FOR SELECT TO anon USING (true);
CREATE POLICY "ai_usage: anon upsert"
  ON public.ai_usage FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "ai_usage: anon update"
  ON public.ai_usage FOR UPDATE TO anon USING (true);

-- ── 7. Cloud-synced Decks ────────────────────────────────────────
-- Mirrors the SavedDeck localStorage shape. Populated by
-- migrateLocalDecksToCloud() on first authenticated sign-in.

CREATE TABLE IF NOT EXISTS public.saved_decks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  commander_name  TEXT        NOT NULL DEFAULT '',
  partner_name    TEXT,
  notes           TEXT,
  games_played    INT         NOT NULL DEFAULT 0,
  wins            INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.saved_decks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_decks: own all"
  ON public.saved_decks FOR ALL USING (auth.uid() = user_id);

-- ── Done ─────────────────────────────────────────────────────
-- Next steps in Supabase Dashboard:
--   Authentication → Providers → Enable "Anonymous Sign-ins"
--   Authentication → Providers → Enable "Google" (for account linking)
--   Authentication → Providers → Enable "Email" (for email/password sign-in)
--   Authentication → URL Configuration → Add your app URL to "Redirect URLs"
--
-- After running this migration, add to Netlify environment variables:
--   VITE_SENTRY_DSN     (from sentry.io after creating a project)
--   VITE_POSTHOG_KEY    (from posthog.com after creating a project)
