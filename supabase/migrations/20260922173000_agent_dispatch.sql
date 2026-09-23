-- New messages wake the agent-respond Edge Function via pg_net.
-- The shared secret lives in Vault; the function checks it through hook_secret_matches().

select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'agent_hook_secret', 'Header secret for agent Edge Functions')
where not exists (select 1 from vault.secrets where name = 'agent_hook_secret');
select vault.create_secret('https://wiimiqqmdmfikuqgqhtm.supabase.co', 'project_url', 'Base URL for Edge Function calls')
where not exists (select 1 from vault.secrets where name = 'project_url');

create function public.hook_secret_matches(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'agent_hook_secret' and decrypted_secret = p_secret)
$$;
revoke execute on function public.hook_secret_matches(text) from public, anon, authenticated;

create function public.call_agent_function(p_function text, p_body jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'agent_hook_secret');
begin
  perform net.http_post(
    url := v_url || '/functions/v1/' || p_function,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-caden-hook', v_secret),
    body := p_body,
    timeout_milliseconds := 5000
  );
end $$;
revoke execute on function public.call_agent_function(text, jsonb) from public, anon, authenticated;

-- Chains stop at hop 4: agent replies carry hop = parent + 1 and hop 4 wakes no one.
create function public.messages_dispatch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind <> 'system' and new.hop < 4 then
    perform public.call_agent_function('agent-respond', jsonb_build_object('message_id', new.id));
  end if;
  return new;
end $$;
revoke execute on function public.messages_dispatch() from public, anon, authenticated;
create trigger messages_dispatch after insert on public.messages
  for each row execute function public.messages_dispatch();
