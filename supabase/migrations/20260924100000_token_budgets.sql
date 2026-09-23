-- Splits the one combined daily token gate into two independent ones: Groq (free — the cap
-- here is a runaway-loop circuit breaker, not a cost control, so it's generous) and Claude
-- (paid — the real cost control, unchanged at 200,000/day). Before this, a chatty office
-- burning free Groq tokens could lock itself out of Claude too, and vice versa, because both
-- were counted against the same 'claude_tokens' row.
insert into public.limits (action, window_seconds, max) values ('groq_tokens', 86400, 2000000)
on conflict (action, window_seconds) do update set max = excluded.max;

-- "Reset the limits for everyone" — since usage is always computed live from agent_runs (there
-- is no stored per-owner counter to zero), the only non-destructive way to give everyone a
-- clean slate is a cutoff both the gate and the client respect: nothing before this point
-- counts toward either cap. agent_runs rows themselves are untouched, so Activity's history is
-- unaffected. Setting it to now() here is the reset, effective the moment this migration runs.
create table public.usage_reset (
  id boolean primary key default true,
  reset_at timestamptz not null default now(),
  constraint usage_reset_singleton check (id)
);
insert into public.usage_reset (id, reset_at) values (true, now());
alter table public.usage_reset enable row level security; -- service role only, same pattern as provider_keys

-- Safe for clients: the reset point and both caps, never anyone's actual usage (agent_runs
-- already tells them that directly, filtered to their own owner_id by RLS).
create function public.usage_context() returns table (reset_at timestamptz, groq_max int, claude_max int)
language sql stable security definer set search_path = '' as $$
  select
    (select ur.reset_at from public.usage_reset ur limit 1),
    (select l.max from public.limits l where l.action = 'groq_tokens' and l.window_seconds = 86400),
    (select l.max from public.limits l where l.action = 'claude_tokens' and l.window_seconds = 86400)
$$;
grant execute on function public.usage_context() to authenticated;
revoke execute on function public.usage_context() from public, anon;
