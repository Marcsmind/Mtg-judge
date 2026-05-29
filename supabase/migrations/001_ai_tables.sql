-- Run this in Supabase → SQL Editor
-- Creates the two tables required for AI quota tracking and response moderation.

-- ── ai_usage — server-side Gemini quota tracking ─────────────────────────────
-- Keyed by hashed IP address + date. The proxy upserts a row per (ip_hash, date)
-- and rejects requests once count >= 5 for free users.
create table if not exists ai_usage (
  user_hash  text        not null,
  date       date        not null,
  count      integer     not null default 0,
  primary key (user_hash, date)
);

-- No RLS needed — only the service role key (used by the Netlify proxy) can write.
-- Rows older than 7 days are safe to delete; a cron job can clean them up.
alter table ai_usage enable row level security;
-- Service role bypasses RLS automatically; no explicit policy needed for the proxy.

-- ── flagged_ai_responses — App Store UGC/AI moderation requirement ────────────
-- Stores AI responses that users flag as inaccurate or problematic.
-- Only stores the response text (truncated to 4000 chars) — no PII beyond user_id.
create table if not exists flagged_ai_responses (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  response_text text        not null,
  reason        text,
  user_id       uuid        references auth.users(id) on delete set null,
  constraint response_text_length check (char_length(response_text) <= 4000)
);

alter table flagged_ai_responses enable row level security;

-- Any authenticated or anonymous user can insert a flag (no auth required to report).
create policy "Anyone can flag a response"
  on flagged_ai_responses
  for insert
  with check (true);

-- Only service role can read flags (for moderation review).
-- No SELECT policy means anon/authenticated roles cannot read the table.
