-- Caden core schema: people, one office each, agents, conversations, messages,
-- invites, routines, usage, email verification and rate limiting.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  display_name text not null default '' check (char_length(display_name) <= 60),
  email_verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.offices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles on delete set null,
  name text not null check (char_length(name) between 1 and 60),
  tone text not null default 'var(--color-horizon)',
  note text check (char_length(note) <= 140),
  created_at timestamptz not null default now()
);

create table public.office_members (
  office_id uuid not null references public.offices on delete cascade,
  user_id uuid not null unique references public.profiles on delete cascade,  -- one office per user
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (office_id, user_id)
);

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade,
  office_id uuid references public.offices on delete set null,
  name text not null check (char_length(name) between 1 and 40),
  handle text not null unique check (handle ~ '^[a-z0-9][a-z0-9._]{1,23}$'),
  tone text not null default 'var(--color-periwinkle)',
  persona text not null default '' check (char_length(persona) <= 2000),
  status text not null default 'Active' check (status in ('Active', 'Idle', 'Paused')),
  created_at timestamptz not null default now()
);
create index on public.agents (office_id);
create index on public.agents (owner_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices on delete cascade,
  kind text not null check (kind in ('office', 'direct', 'group')),
  title text check (char_length(title) <= 60),
  member_key text,  -- sorted participant ids; reuses identical direct/group threads
  created_by_user uuid references public.profiles on delete set null,
  created_by_agent uuid references public.agents on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create unique index conversations_member_key on public.conversations (office_id, member_key) where member_key is not null;
create unique index conversations_one_office_thread on public.conversations (office_id) where kind = 'office';

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations on delete cascade,
  agent_id uuid references public.agents on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  check ((agent_id is null) <> (user_id is null))
);
create unique index on public.conversation_participants (conversation_id, agent_id) where agent_id is not null;
create unique index on public.conversation_participants (conversation_id, user_id) where user_id is not null;
create index on public.conversation_participants (agent_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  office_id uuid not null references public.offices on delete cascade,
  author_user_id uuid references public.profiles on delete set null,
  author_agent_id uuid references public.agents on delete set null,
  kind text not null check (kind in ('agent', 'you', 'system')),
  body text not null check (char_length(body) between 1 and 4000),
  hop int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);
create index on public.messages (office_id, created_at);

create table public.office_invites (
  token text primary key default encode(extensions.gen_random_bytes(16), 'hex'),
  office_id uuid not null references public.offices on delete cascade,
  created_by uuid references public.profiles on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses int not null default 25,
  uses int not null default 0,
  created_at timestamptz not null default now()
);

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents on delete cascade,
  schedule jsonb not null,  -- {kind: daily|weekdays|weekly, hour, minute, weekday?, tz}
  instruction text not null check (char_length(instruction) between 1 and 1000),
  enabled boolean not null default true,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.routines (next_run_at) where enabled;

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents on delete set null,
  owner_id uuid references public.profiles on delete cascade,
  office_id uuid references public.offices on delete cascade,
  conversation_id uuid references public.conversations on delete set null,
  trigger text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.agent_runs (owner_id, created_at);
create index on public.agent_runs (office_id, created_at);

create table public.email_verifications (
  user_id uuid primary key references public.profiles on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.limits (
  action text not null,
  window_seconds int not null,
  max int not null,
  primary key (action, window_seconds)
);

create table public.rate_events (
  id bigint generated always as identity primary key,
  subject text not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index on public.rate_events (subject, action, created_at);

insert into public.limits (action, window_seconds, max) values
  ('human_message', 60, 20),
  ('agent_message', 60, 10),
  ('agent_message', 86400, 200),
  ('agent_new_conversation', 600, 5),
  ('invite_create', 3600, 10),
  ('invite_join', 3600, 10),
  ('verify_email', 3600, 3),
  ('claude_tokens', 86400, 200000);

-- ─── Helpers ─────────────────────────────────────────────────────────────────

create function public.my_office_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select office_id from public.office_members where user_id = auth.uid()
$$;

create function public.is_office_member(p_office uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.office_members where office_id = p_office and user_id = auth.uid())
$$;

-- Verified, or still inside the 1-hour grace window after sign-up.
create function public.can_act() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (email_verified_at is not null or created_at > now() - interval '1 hour')
  )
$$;

-- Records one event for (subject, action) or raises `rate_limited` if any window is full.
create function public.check_rate(p_subject text, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  l record;
  n int;
begin
  perform pg_advisory_xact_lock(hashtext(p_subject || ':' || p_action));
  for l in select window_seconds, max from public.limits where action = p_action loop
    select count(*) into n from public.rate_events
      where subject = p_subject and action = p_action
        and created_at > now() - make_interval(secs => l.window_seconds);
    if n >= l.max then
      raise exception 'rate_limited' using hint = l.window_seconds::text, errcode = 'P0001';
    end if;
  end loop;
  insert into public.rate_events (subject, action) values (p_subject, p_action);
end $$;

create function public.require_can_act() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if not public.can_act() then raise exception 'verify_email' using errcode = 'P0001'; end if;
end $$;

-- ─── Triggers ────────────────────────────────────────────────────────────────

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- An agent always lives in its owner's office.
create function public.agents_pin_office() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.office_id := (select office_id from public.office_members where user_id = new.owner_id);
  new.handle := lower(new.handle);
  return new;
end $$;
create trigger agents_pin_office before insert or update on public.agents
  for each row execute function public.agents_pin_office();

create function public.members_move_agents() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update public.agents set office_id = null where owner_id = old.user_id;
    return old;
  end if;
  update public.agents set office_id = new.office_id where owner_id = new.user_id;
  return new;
end $$;
create trigger members_move_agents after insert or update or delete on public.office_members
  for each row execute function public.members_move_agents();

-- Messages: office_id comes from the conversation; people are rate-limited.
create function public.messages_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.office_id := (select office_id from public.conversations where id = new.conversation_id);
  if new.author_user_id is not null and auth.uid() is not null then
    perform public.check_rate(new.author_user_id::text, 'human_message');
  end if;
  return new;
end $$;
create trigger messages_before_insert before insert on public.messages
  for each row execute function public.messages_before_insert();

create function public.messages_touch_conversation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;
create trigger messages_touch_conversation after insert on public.messages
  for each row execute function public.messages_touch_conversation();

-- ─── RPCs ────────────────────────────────────────────────────────────────────

create function public.create_office(p_name text, p_tone text default 'var(--color-horizon)', p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_office uuid;
begin
  perform public.require_can_act();
  if public.my_office_id() is not null then
    raise exception 'already_in_office' using errcode = 'P0001';
  end if;
  insert into public.offices (owner_id, name, tone, note) values (auth.uid(), p_name, p_tone, p_note)
    returning id into v_office;
  insert into public.office_members (office_id, user_id, role) values (v_office, auth.uid(), 'owner');
  insert into public.conversations (office_id, kind, title, created_by_user) values (v_office, 'office', p_name, auth.uid());
  return v_office;
end $$;

create function public.create_invite() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_office uuid := public.my_office_id();
  v_token text;
begin
  perform public.require_can_act();
  if v_office is null then raise exception 'no_office' using errcode = 'P0001'; end if;
  perform public.check_rate(auth.uid()::text, 'invite_create');
  insert into public.office_invites (office_id, created_by) values (v_office, auth.uid()) returning token into v_token;
  return v_token;
end $$;

-- What the Join screen shows before you commit.
create function public.invite_preview(p_token text)
returns table (office_name text, office_tone text, members int, valid boolean)
language sql stable security definer set search_path = '' as $$
  select o.name, o.tone,
    (select count(*)::int from public.office_members m where m.office_id = o.id),
    (i.expires_at > now() and i.uses < i.max_uses)
  from public.office_invites i join public.offices o on o.id = i.office_id
  where i.token = p_token
$$;

create function public.leave_office() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_office uuid := public.my_office_id();
  v_role text;
  v_next uuid;
begin
  if v_office is null then return; end if;
  select role into v_role from public.office_members where user_id = auth.uid();
  delete from public.office_members where user_id = auth.uid();
  if v_role = 'owner' then
    select user_id into v_next from public.office_members where office_id = v_office order by joined_at limit 1;
    if v_next is null then
      delete from public.offices where id = v_office;
      return;
    end if;
    update public.office_members set role = 'owner' where user_id = v_next;
    update public.offices set owner_id = v_next where id = v_office;
  end if;
  insert into public.messages (conversation_id, kind, body)
    select c.id, 'system', coalesce(nullif(p.display_name, ''), 'Someone') || ' left the office'
    from public.conversations c, public.profiles p
    where c.office_id = v_office and c.kind = 'office' and p.id = auth.uid();
end $$;

create function public.join_office(p_token text, p_leave_current boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.office_invites;
  v_current uuid := public.my_office_id();
begin
  perform public.require_can_act();
  perform public.check_rate(auth.uid()::text, 'invite_join');
  select * into v_invite from public.office_invites where token = p_token for update;
  if not found or v_invite.expires_at <= now() or v_invite.uses >= v_invite.max_uses then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;
  if v_current = v_invite.office_id then return v_current; end if;
  if v_current is not null then
    if not p_leave_current then raise exception 'already_in_office' using errcode = 'P0001'; end if;
    perform public.leave_office();
  end if;
  insert into public.office_members (office_id, user_id, role) values (v_invite.office_id, auth.uid(), 'member');
  update public.office_invites set uses = uses + 1 where token = p_token;
  insert into public.messages (conversation_id, kind, body)
    select c.id, 'system', coalesce(nullif(p.display_name, ''), 'Someone') || ' joined the office'
    from public.conversations c, public.profiles p
    where c.office_id = v_invite.office_id and c.kind = 'office' and p.id = auth.uid();
  return v_invite.office_id;
end $$;

-- Shared by people and agents: find or create the thread for an exact participant set.
create function public.open_conversation_internal(
  p_office uuid, p_agent_ids uuid[], p_user_ids uuid[], p_by_user uuid, p_by_agent uuid, p_title text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_agents uuid[] := array(select distinct unnest(coalesce(p_agent_ids, '{}')) order by 1);
  v_users uuid[] := array(select distinct unnest(coalesce(p_user_ids, '{}')) order by 1);
  v_count int;
  v_key text;
  v_id uuid;
begin
  v_count := cardinality(v_agents) + cardinality(v_users);
  if v_count < 2 then raise exception 'too_few_participants' using errcode = 'P0001'; end if;
  if cardinality(v_agents) > 12 then raise exception 'too_many_participants' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(v_agents) a where not exists (
      select 1 from public.agents where id = a and office_id = p_office)) then
    raise exception 'agent_not_in_office' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_users) u where not exists (
      select 1 from public.office_members where user_id = u and office_id = p_office)) then
    raise exception 'user_not_in_office' using errcode = 'P0001';
  end if;
  v_key := array_to_string(array(select 'a:' || unnest(v_agents)) || array(select 'u:' || unnest(v_users)), ',');
  select id into v_id from public.conversations where office_id = p_office and member_key = v_key;
  if v_id is not null then return v_id; end if;
  insert into public.conversations (office_id, kind, title, member_key, created_by_user, created_by_agent)
    values (p_office, case when v_count = 2 then 'direct' else 'group' end, p_title, v_key, p_by_user, p_by_agent)
    returning id into v_id;
  insert into public.conversation_participants (conversation_id, agent_id) select v_id, unnest(v_agents);
  insert into public.conversation_participants (conversation_id, user_id) select v_id, unnest(v_users);
  return v_id;
end $$;

create function public.open_conversation(p_agent_ids uuid[], p_include_me boolean default true, p_title text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_office uuid := public.my_office_id();
begin
  perform public.require_can_act();
  if v_office is null then raise exception 'no_office' using errcode = 'P0001'; end if;
  return public.open_conversation_internal(
    v_office, p_agent_ids, case when p_include_me then array[auth.uid()] else '{}' end, auth.uid(), null, p_title);
end $$;

-- Only Edge Functions (service role) call these.
revoke execute on function public.open_conversation_internal(uuid, uuid[], uuid[], uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.check_rate(text, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ─── Row level security ─────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.offices enable row level security;
alter table public.office_members enable row level security;
alter table public.agents enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.office_invites enable row level security;
alter table public.routines enable row level security;
alter table public.agent_runs enable row level security;
alter table public.email_verifications enable row level security;  -- service role only
alter table public.limits enable row level security;               -- service role only
alter table public.rate_events enable row level security;          -- service role only

create policy "see self and officemates" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or exists (
    select 1 from public.office_members m where m.user_id = profiles.id and m.office_id = (select public.my_office_id())));
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()) and (select public.can_act()));
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "members see office" on public.offices for select to authenticated
  using ((select public.is_office_member(id)));
create policy "owner edits office" on public.offices for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and (select public.can_act()));
revoke update on public.offices from authenticated;
grant update (name, tone, note) on public.offices to authenticated;

create policy "members see members" on public.office_members for select to authenticated
  using ((select public.is_office_member(office_id)));

create policy "office sees agents" on public.agents for select to authenticated
  using (owner_id = (select auth.uid()) or office_id = (select public.my_office_id()));
create policy "owner creates agents" on public.agents for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.can_act()) and (select public.my_office_id()) is not null);
create policy "owner edits agents" on public.agents for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and (select public.can_act()));
create policy "owner deletes agents" on public.agents for delete to authenticated
  using (owner_id = (select auth.uid()));
revoke update on public.agents from authenticated;
grant update (name, tone, persona, status) on public.agents to authenticated;

create policy "members see conversations" on public.conversations for select to authenticated
  using ((select public.is_office_member(office_id)));
create policy "members see participants" on public.conversation_participants for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and (select public.is_office_member(c.office_id))));

create policy "members read messages" on public.messages for select to authenticated
  using ((select public.is_office_member(office_id)));
create policy "members post messages" on public.messages for insert to authenticated
  with check (
    author_user_id = (select auth.uid()) and author_agent_id is null and kind = 'you' and hop = 0
    and (select public.can_act())
    and exists (select 1 from public.conversations c where c.id = conversation_id and (select public.is_office_member(c.office_id)))
  );

create policy "members see invites" on public.office_invites for select to authenticated
  using ((select public.is_office_member(office_id)));

create policy "owner manages routines" on public.routines for all to authenticated
  using (exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = (select auth.uid())))
  with check ((select public.can_act()) and exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = (select auth.uid())));

create policy "members see runs" on public.agent_runs for select to authenticated
  using ((select public.is_office_member(office_id)));

-- ─── Realtime + housekeeping ────────────────────────────────────────────────

alter publication supabase_realtime add table public.messages, public.conversations;

select cron.schedule('prune-rate-events', '0 * * * *',
  $$delete from public.rate_events where created_at < now() - interval '2 days'$$);
