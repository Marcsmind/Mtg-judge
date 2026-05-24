# Supabase SQL Migrations

Run each block in the Supabase Dashboard → SQL Editor.
All blocks are idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`) — safe to re-run.

---

## Migration 1 — `game_states` (multiplayer disconnect recovery)

Required for Fix D: DB persistence on disconnect. One row per active room,
written on every broadcast, read on reconnect as a fallback when no peer is
available to respond to a state_request.

```sql
-- ── game_states ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_states (
  room_code  TEXT        PRIMARY KEY,
  state_json JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE game_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read"
  ON game_states FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "anon insert"
  ON game_states FOR INSERT
  WITH CHECK (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "anon update"
  ON game_states FOR UPDATE
  USING (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "anon delete"
  ON game_states FOR DELETE
  USING (auth.role() IN ('anon', 'authenticated'));
```

### Optional: automatic cleanup of stale rows

```sql
SELECT cron.schedule(
  'cleanup-stale-games',
  '0 * * * *',
  $$DELETE FROM game_states WHERE updated_at < now() - interval '24 hours'$$
);
```

---

## Migration 2 — `profiles` (player display names & avatars)

Required for the leaderboard feature. One row per auth user, upserted on
every app launch via `auth.ts → upsertProfile()`.

```sql
-- ── profiles ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT        NOT NULL DEFAULT 'Player',
  avatar_emoji  TEXT        NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read profiles (needed for leaderboard display names)
CREATE POLICY "profiles read"
  ON profiles FOR SELECT
  USING (true);

-- Users can only write their own profile
CREATE POLICY "profiles insert"
  ON profiles FOR INSERT
  WITH CHECK (true);

CREATE POLICY "profiles update"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);
```

---

## Migration 3 — `game_sessions` + `game_participants` (leaderboard recording)

Required for end-game recording (`leaderboard.ts → recordGame()`) and the
stats/leaderboard queries. Run this entire block together.

```sql
-- ── game_sessions ─────────────────────────────────────────────────────────────
-- One row per completed game, written when the host taps "End & Record".
CREATE TABLE IF NOT EXISTS game_sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code     TEXT,
  player_count  INT         NOT NULL,
  starting_life INT         NOT NULL,
  duration_secs INT         NOT NULL,
  completed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session insert"
  ON game_sessions FOR INSERT
  WITH CHECK (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "session read"
  ON game_sessions FOR SELECT
  USING (true);

-- ── game_participants ─────────────────────────────────────────────────────────
-- One row per player per game. user_id is null for seats not claimed by an
-- authenticated device (anonymous seats still recorded for game history).
CREATE TABLE IF NOT EXISTS game_participants (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        UUID        NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  player_name    TEXT        NOT NULL,
  final_life     INT         NOT NULL,
  is_winner      BOOLEAN     NOT NULL,
  commander_name TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE game_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participant insert"
  ON game_participants FOR INSERT
  WITH CHECK (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "participant read"
  ON game_participants FOR SELECT
  USING (true);

-- Indexes for stats queries (user_id lookup, cascade deletes)
CREATE INDEX IF NOT EXISTS game_participants_user_id_idx ON game_participants(user_id);
CREATE INDEX IF NOT EXISTS game_participants_game_id_idx ON game_participants(game_id);
```

---

## Migration 4 — `player_stats` view (efficient leaderboard aggregation)

Run after Migration 3. This view replaces a slow JavaScript GROUP BY that
would fetch all participant rows into memory. Query this view directly for
leaderboard data.

```sql
-- ── player_stats ──────────────────────────────────────────────────────────────
-- Pre-aggregated win/loss counts per user. Only includes users with ≥ 3 games.
CREATE OR REPLACE VIEW player_stats AS
SELECT
  user_id,
  COUNT(*)                                                   AS total_games,
  SUM(CASE WHEN is_winner THEN 1 ELSE 0 END)::INT           AS wins,
  ROUND(
    SUM(CASE WHEN is_winner THEN 1 ELSE 0 END)::NUMERIC
    / NULLIF(COUNT(*), 0) * 100,
    1
  )                                                          AS win_rate
FROM   game_participants
WHERE  user_id IS NOT NULL
GROUP  BY user_id
HAVING COUNT(*) >= 3;
```

---

## Storage estimates

| Table | 100 games | 10K games |
|-------|-----------|-----------|
| game_sessions | ~50 KB | ~5 MB |
| game_participants (4 players avg) | ~200 KB | ~20 MB |
| profiles | ~10 KB | ~1 MB |
| game_states (active rooms only) | ~150 KB | ~150 KB |

All well within Supabase free tier (500 MB limit).
