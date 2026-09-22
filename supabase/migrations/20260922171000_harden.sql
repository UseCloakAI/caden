-- Nothing is callable without signing in; trigger/internal functions aren't callable at all.
alter default privileges in schema public revoke execute on functions from public, anon;

revoke execute on all functions in schema public from public, anon;

revoke execute on function
  public.agents_pin_office(), public.members_move_agents(),
  public.messages_before_insert(), public.messages_touch_conversation(),
  public.require_can_act()
from authenticated;

-- RLS helpers and user-facing RPCs stay available to signed-in users.
grant execute on function
  public.my_office_id(), public.is_office_member(uuid), public.can_act(),
  public.create_office(text, text, text), public.create_invite(), public.invite_preview(text),
  public.join_office(text, boolean), public.leave_office(), public.open_conversation(uuid[], boolean, text)
to authenticated;

drop extension if exists pg_net;
create extension pg_net schema extensions;
