-- Caden home brain. Homes are identified by a SHA-256 of their home code
-- (the code itself never reaches the server). Only the `brain` edge function
-- (service role) reads or writes these: RLS on, no policies.
create table if not exists public.home_turns (
  id text primary key,
  home text not null check (home ~ '^[0-9a-f]{64}$'),
  who text not null default 'Someone',
  who_id text,
  device text,
  room text,
  text text not null,
  reply text not null default '',
  at timestamptz not null default now()
);
create index if not exists home_turns_home_at on public.home_turns (home, at desc);

create table if not exists public.home_memories (
  id bigint generated always as identity primary key,
  home text not null check (home ~ '^[0-9a-f]{64}$'),
  fact text not null,
  who text,
  created_at timestamptz not null default now()
);
create index if not exists home_memories_home on public.home_memories (home, created_at desc);

alter table public.home_turns enable row level security;
alter table public.home_memories enable row level security;
revoke all on public.home_turns, public.home_memories from anon, authenticated;
