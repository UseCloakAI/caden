-- What each agent is doing right now, written by Edge Functions as a turn plays out and shown
-- live in the thread ("Joe is searching…", "Raymond is messaging Nova"). One row per agent,
-- upserted; state 'idle' when the turn ends, so realtime filters never have to see a delete.
create table public.agent_activity (
  agent_id uuid primary key references public.agents (id) on delete cascade,
  office_id uuid not null references public.offices (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  state text not null default 'idle' check (state in ('idle', 'reading', 'thinking', 'searching', 'messaging', 'writing')),
  detail text,
  updated_at timestamptz not null default now()
);
create index agent_activity_office on public.agent_activity (office_id);
alter table public.agent_activity enable row level security;
create policy "office sees what agents are doing" on public.agent_activity for select to authenticated
  using ((select public.is_office_member(office_id)));
alter publication supabase_realtime add table public.agent_activity;
