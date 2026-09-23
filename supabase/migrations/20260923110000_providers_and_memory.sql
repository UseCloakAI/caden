-- Groq-first provider layer: a donated-key pool that cycles, Claude as last resort.
-- Plus per-conversation compaction columns and the private bucket for soul/memory/heartbeat .md files.

create table public.provider_keys (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'groq' check (provider in ('groq')),
  api_key text not null,
  donated_by uuid references public.profiles on delete set null,
  label text,
  enabled boolean not null default true,
  last_used_at timestamptz,
  cooldown_until timestamptz,
  consecutive_failures int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.provider_keys (provider, enabled, cooldown_until);

-- Service-role only: RLS on with zero policies denies anon/authenticated entirely over PostgREST.
-- Edge Functions use the service key, which bypasses RLS, so this table's contents never reach a client.
alter table public.provider_keys enable row level security;

-- Pool health, safe for clients: counts only, never key material.
create function public.provider_key_stats() returns table (healthy int, cooling_down int)
language sql stable security definer set search_path = '' as $$
  select
    count(*) filter (where enabled and (cooldown_until is null or cooldown_until <= now()))::int,
    count(*) filter (where enabled and cooldown_until > now())::int
  from public.provider_keys where provider = 'groq'
$$;
grant execute on function public.provider_key_stats() to authenticated;

-- Per-conversation compaction: a rolling summary stands in for everything older than it.
alter table public.conversations add column summary text;
alter table public.conversations add column summarized_through timestamptz;

-- Which provider/model actually served each turn, for cost and free-tier visibility.
alter table public.agent_runs add column provider text;
alter table public.agent_runs add column model text;

-- Private bucket for the literal .md files: agent souls, agent memories, system heartbeat.
-- No storage.objects policies are added; only the service role (bypasses RLS) touches it.
insert into storage.buckets (id, name, public) values ('agent-files', 'agent-files', false)
on conflict (id) do nothing;

-- Rate limit for donating a Groq key.
insert into public.limits (action, window_seconds, max) values ('donate_key', 3600, 5);

-- provider_key_stats was left callable by anon too (PL/pgSQL functions grant to PUBLIC by
-- default). Restrict it to signed-in users, matching every other RPC in this schema.
revoke execute on function public.provider_key_stats() from public, anon;
