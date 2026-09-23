-- Tavily search pool: the same cycling-key table and mechanics as Groq, told apart only by
-- provider_keys.provider. Widens the provider check and makes the pool-health RPC take which
-- provider to report on, instead of assuming Groq.

-- The original check constraint (`provider in ('groq')`) was left unnamed, so Postgres picked
-- its name. Find it by which column it actually constrains, not by string-matching its printed
-- definition: Postgres rewrites `x in (v)` to `x = any (array[v])` before printing, so an IN
-- literally never appears in pg_get_constraintdef's output — matching for one would silently
-- find nothing, and the add below would then fail as a duplicate of the (un-dropped) original.
do $$
declare c_name text;
begin
  select con.conname into c_name
  from pg_constraint con
  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
  where con.conrelid = 'public.provider_keys'::regclass
    and con.contype = 'c'
    and att.attname = 'provider';
  if c_name is not null then
    execute format('alter table public.provider_keys drop constraint %I', c_name);
  end if;
end $$;

alter table public.provider_keys
  add constraint provider_keys_provider_check check (provider in ('groq', 'tavily'));

-- provider_key_stats() → provider_key_stats(p_provider). A defaulted extra parameter is a new
-- overload to Postgres, not a replacement, and the two would collide on a zero-arg call — so
-- the old zero-arg function is dropped first.
drop function if exists public.provider_key_stats();

create function public.provider_key_stats(p_provider text default 'groq') returns table (healthy int, cooling_down int)
language sql stable security definer set search_path = '' as $$
  select
    count(*) filter (where enabled and (cooldown_until is null or cooldown_until <= now()))::int,
    count(*) filter (where enabled and cooldown_until > now())::int
  from public.provider_keys where provider = p_provider
$$;

grant execute on function public.provider_key_stats(text) to authenticated;
revoke execute on function public.provider_key_stats(text) from public, anon;
