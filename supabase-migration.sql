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

-- ── Done ─────────────────────────────────────────────────────
-- Next steps in Supabase Dashboard:
--   Authentication → Providers → Enable "Anonymous Sign-ins"
--   Authentication → Providers → Enable "Google" (for account linking)
--   Authentication → URL Configuration → Add your app URL to "Redirect URLs"
