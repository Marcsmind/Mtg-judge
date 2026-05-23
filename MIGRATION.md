# Supabase SQL Migration — `game_states` table

Run this SQL in the Supabase Dashboard → SQL Editor.
This is a one-time migration required for Fix D (DB persistence on disconnect).

```sql
-- ── game_states ───────────────────────────────────────────────────────────────
-- One row per active room. Written on every broadcast, read on reconnect.
-- Provides full-group disconnect recovery when no peer is available to respond
-- to a state_request (Fix A).
CREATE TABLE IF NOT EXISTS game_states (
  room_code  TEXT        PRIMARY KEY,
  state_json JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row-Level Security: anon key can read and write (no user auth required)
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

## Optional: automatic cleanup of stale rows

If your Supabase project has `pg_cron` enabled (Pro plan), you can schedule
hourly cleanup of rows older than 24 hours:

```sql
SELECT cron.schedule(
  'cleanup-stale-games',
  '0 * * * *',
  $$DELETE FROM game_states WHERE updated_at < now() - interval '24 hours'$$
);
```

Without pg_cron, the app handles staleness automatically — `fetchPersistedState()`
treats rows older than 24 h as "no state" (returns null) even if the row exists.

## Storage estimate

| Active rooms | Approximate storage |
|-------------|---------------------|
| 10          | ~150 KB             |
| 100         | ~1.5 MB             |
| 1,000       | ~15 MB              |

Well within Supabase free tier (500 MB limit).
