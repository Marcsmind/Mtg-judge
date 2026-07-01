-- Run this in Supabase → SQL Editor
-- Creates collection_groups and collection_cards with per-user RLS.

-- ── collection_groups ─────────────────────────────────────────────────────────

create table if not exists collection_groups (
  id         uuid    primary key,
  user_id    uuid    not null references auth.users(id) on delete cascade,
  name       text    not null,
  type       text    not null default 'custom',
  created_at bigint  not null  -- Date.now() milliseconds
);

alter table collection_groups enable row level security;

create policy "Users manage their own groups"
  on collection_groups for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists collection_groups_user_id on collection_groups (user_id);

-- ── collection_cards ──────────────────────────────────────────────────────────

create table if not exists collection_cards (
  id          uuid    primary key,
  user_id     uuid    not null references auth.users(id) on delete cascade,
  group_id    uuid    not null,
  scryfall_id text    not null,
  name        text    not null,
  quantity    int     not null default 1,
  foil        boolean not null default false,
  added_at    bigint  not null,  -- Date.now() milliseconds
  colors      jsonb   not null default '[]',
  type_line   text    not null default '',
  cmc         numeric not null default 0,
  image_uri   text    not null default '',
  price_usd   numeric,
  rarity      text    not null default 'common',
  set_code    text    not null default ''
);

alter table collection_cards enable row level security;

create policy "Users manage their own cards"
  on collection_cards for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists collection_cards_user_id   on collection_cards (user_id);
create index if not exists collection_cards_group_id  on collection_cards (group_id);
