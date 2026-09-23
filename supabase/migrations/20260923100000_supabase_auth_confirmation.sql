-- Standard Supabase email confirmation replaces the custom 1-hour grace flow.
-- Unconfirmed users can't sign in; can_act() stays as a defensive check.

create or replace function public.can_act() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null)
$$;

-- Mirror confirmation into profiles for display.
create function public.sync_email_confirmed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email_verified_at = new.email_confirmed_at where id = new.id;
  return new;
end $$;
revoke execute on function public.sync_email_confirmed() from public, anon, authenticated;
create trigger on_auth_email_confirmed after update of email_confirmed_at on auth.users
  for each row execute function public.sync_email_confirmed();

update public.profiles p set email_verified_at = u.email_confirmed_at from auth.users u where u.id = p.id;

drop table public.email_verifications;
delete from public.limits where action = 'verify_email';
