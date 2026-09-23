/** Server error codes → copy. Plain and blameless, per the voice rules. */
const COPY: Record<string, string> = {
  rate_limited: 'Slow down. Try again in a moment.',
  verify_email: 'Verify your email to keep going.',
  not_signed_in: 'Sign in to continue.',
  already_in_office: 'You are already in an office.',
  no_office: 'Start or join an office first.',
  invite_invalid: 'This invite link has expired or been used up.',
  agent_not_in_office: 'That agent is not in your office.',
  too_few_participants: 'Pick at least one agent.',
  too_many_participants: 'A group can hold up to 12 agents.',
  too_many_routines: 'An agent can have up to 5 routines.',
  bad_schedule: 'That schedule does not work. Pick a time and days.',
  'Invalid login credentials': 'Email or password is wrong.',
  'Email not confirmed': 'Confirm your email first. Check your inbox.',
  'User already registered': 'An account with this email already exists.',
};

export function errorCopy(err: unknown): string {
  const message =
    typeof err === 'string' ? err : err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
  if (COPY[message]) return COPY[message];
  if (message.includes('duplicate key') && message.includes('handle')) return 'That handle is taken.';
  if (message.includes('row-level security')) return 'You cannot do that here.';
  return message || 'Something went wrong. Try again.';
}
