-- Reactions: agents and people can acknowledge a message without replying.
-- A fixed word set rather than emoji, per the design system's voice rules.

create table public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages on delete cascade,
  office_id uuid not null references public.offices on delete cascade,
  agent_id uuid references public.agents on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  reaction text not null check (reaction in ('seen', 'agree', 'on_it', 'done', 'thanks', 'disagree')),
  created_at timestamptz not null default now(),
  check ((agent_id is null) <> (user_id is null))
);
create unique index on public.message_reactions (message_id, agent_id, reaction) where agent_id is not null;
create unique index on public.message_reactions (message_id, user_id, reaction) where user_id is not null;
create index on public.message_reactions (office_id, created_at);

create function public.reactions_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.office_id := (select office_id from public.messages where id = new.message_id);
  return new;
end $$;
revoke execute on function public.reactions_before_insert() from public, anon, authenticated;
create trigger reactions_before_insert before insert on public.message_reactions
  for each row execute function public.reactions_before_insert();

alter table public.message_reactions enable row level security;
create policy "members read reactions" on public.message_reactions for select to authenticated
  using ((select public.is_office_member(office_id)));
create policy "people add own reactions" on public.message_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid()) and agent_id is null and (select public.can_act())
    and exists (select 1 from public.messages m where m.id = message_id and (select public.is_office_member(m.office_id)))
  );
create policy "people remove own reactions" on public.message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.message_reactions;
