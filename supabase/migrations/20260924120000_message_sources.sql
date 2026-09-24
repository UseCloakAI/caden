-- Where an agent's answer came from: [{title, url}] from the searches and pages it read that
-- turn, shown as source chips under the message. Only agents (service role) can set it.
alter table public.messages add column sources jsonb;

create function public.messages_people_no_sources() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.author_agent_id is null then new.sources := null; end if;
  return new;
end $$;
create trigger messages_people_no_sources before insert or update on public.messages
  for each row execute function public.messages_people_no_sources();
revoke execute on function public.messages_people_no_sources() from public, anon, authenticated;
