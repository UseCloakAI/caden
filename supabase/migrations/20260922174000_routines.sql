-- Scheduled routines: next run is always computed server-side from the schedule.

create function public.routine_next_run(p_schedule jsonb, p_after timestamptz) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare
  v_tz text := coalesce(p_schedule ->> 'tz', 'UTC');
  v_kind text := p_schedule ->> 'kind';
  v_hour int := (p_schedule ->> 'hour')::int;
  v_minute int := (p_schedule ->> 'minute')::int;
  v_weekday int := coalesce((p_schedule ->> 'weekday')::int, 1);  -- 0 = Sunday
  v_local timestamp;
  v_candidate timestamp;
begin
  if v_kind not in ('daily', 'weekdays', 'weekly') or v_hour not between 0 and 23 or v_minute not between 0 and 59
     or v_weekday not between 0 and 6 then
    raise exception 'bad_schedule' using errcode = 'P0001';
  end if;
  v_local := p_after at time zone v_tz;
  for i in 0..8 loop
    v_candidate := date_trunc('day', v_local) + make_interval(days => i, hours => v_hour, mins => v_minute);
    if v_candidate > v_local and (
      v_kind = 'daily'
      or (v_kind = 'weekdays' and extract(isodow from v_candidate) between 1 and 5)
      or (v_kind = 'weekly' and extract(dow from v_candidate) = v_weekday)
    ) then
      return v_candidate at time zone v_tz;
    end if;
  end loop;
  raise exception 'bad_schedule' using errcode = 'P0001';
end $$;

create function public.routines_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.routines where agent_id = new.agent_id) >= 5 then
      raise exception 'too_many_routines' using errcode = 'P0001';
    end if;
    new.next_run_at := public.routine_next_run(new.schedule, now());
  elsif new.schedule is distinct from old.schedule or (new.enabled and not old.enabled) then
    new.next_run_at := public.routine_next_run(new.schedule, now());
  end if;
  return new;
end $$;
create trigger routines_before_write before insert or update on public.routines
  for each row execute function public.routines_before_write();

-- Clients set the schedule; the server owns timing.
revoke update on public.routines from authenticated;
grant update (schedule, instruction, enabled) on public.routines to authenticated;

-- Claims a due routine and advances it, so overlapping ticks never double-run.
create function public.claim_due_routines(p_limit int default 20)
returns table (routine_id uuid, agent_id uuid, instruction text)
language sql security definer set search_path = '' as $$
  update public.routines r
     set last_run_at = now(), next_run_at = public.routine_next_run(r.schedule, now())
   where r.id in (
     select id from public.routines
      where enabled and next_run_at <= now()
      order by next_run_at
      limit p_limit
      for update skip locked)
  returning r.id, r.agent_id, r.instruction
$$;

revoke execute on function public.routines_before_write(), public.claim_due_routines(int) from public, anon, authenticated;
revoke execute on function public.routine_next_run(jsonb, timestamptz) from public, anon;

select cron.schedule('agent-tick', '*/5 * * * *', $$select public.call_agent_function('agent-tick', '{}'::jsonb)$$);
