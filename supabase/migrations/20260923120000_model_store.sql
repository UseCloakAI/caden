-- The model store: every Groq model an agent can run on is a "chip". People add chips to
-- their library (free, nothing downloads), then slot one into an agent's brain. Claude Haiku
-- is never a chip; it stays the silent last resort in providers.ts.

create table public.model_chips (
  id text primary key,
  name text not null,
  model text not null,                       -- Groq model id sent to the API
  reasoning_effort text check (reasoning_effort in ('low', 'medium', 'high')),
  maker text not null,
  tagline text not null,
  best_at text not null,
  pros text[] not null default '{}',
  cons text[] not null default '{}',
  smarts smallint not null check (smarts between 1 and 5),
  speed smallint not null check (speed between 1 and 5),
  stamina smallint not null check (stamina between 1 and 5), -- headroom on the free tier
  context_tokens integer not null,
  rpm integer, rpd integer, tpm integer, tpd integer, -- Groq free tier, per key
  tone text not null,
  sort smallint not null default 0,
  is_default boolean not null default false,  -- in everyone's library, can't be removed
  live boolean not null default true,         -- flipped by agent-tick against Groq's /models
  checked_at timestamptz
);
create unique index model_chips_one_default on public.model_chips (is_default) where is_default;
alter table public.model_chips enable row level security;
create policy "anyone signed in browses the store" on public.model_chips for select to authenticated using (true);

create table public.user_chips (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  chip_id text not null references public.model_chips (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, chip_id)
);
alter table public.user_chips enable row level security;
create policy "own library" on public.user_chips for select to authenticated using (user_id = (select auth.uid()));
create policy "add to own library" on public.user_chips for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.can_act()));
create policy "remove from own library" on public.user_chips for delete to authenticated using (user_id = (select auth.uid()));

alter table public.agents add column chip_id text references public.model_chips (id) on delete set null;
grant update (chip_id) on public.agents to authenticated;
create index agents_chip_id on public.agents (chip_id);

-- An agent can only run on a chip its owner has (the default chip is everyone's).
create function public.agents_chip_owned() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.chip_id is not null
     and not exists (select 1 from public.model_chips c where c.id = new.chip_id and c.is_default)
     and not exists (select 1 from public.user_chips u where u.user_id = new.owner_id and u.chip_id = new.chip_id) then
    raise exception 'chip_not_in_library';
  end if;
  return new;
end $$;
create trigger agents_chip_owned before insert or update of chip_id on public.agents
  for each row execute function public.agents_chip_owned();

-- Pulling a chip from the library pops it out of every agent that had it slotted.
create function public.user_chips_unslot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.agents set chip_id = null where owner_id = old.user_id and chip_id = old.chip_id;
  return old;
end $$;
create trigger user_chips_unslot after delete on public.user_chips
  for each row execute function public.user_chips_unslot();

revoke execute on function public.agents_chip_owned() from public, anon, authenticated;
revoke execute on function public.user_chips_unslot() from public, anon, authenticated;

-- Groq rate limits are per model, so a 429 cools a key down for that model only.
alter table public.provider_keys add column model_cooldowns jsonb not null default '{}';

insert into public.model_chips
  (id, name, model, reasoning_effort, maker, tagline, best_at, pros, cons, smarts, speed, stamina, context_tokens, rpm, rpd, tpm, tpd, tone, sort, is_default)
values
  ('workhorse', 'Workhorse', 'openai/gpt-oss-120b', 'low', 'OpenAI',
   'The all-rounder every agent ships with.',
   'Everyday office life: answering people, messaging other agents, keeping threads moving.',
   array['Smart without the wait', 'Reliable with tools: reactions, DMs, office posts', 'Sticks closely to a persona'],
   array['Doesn''t stop to think hard on tricky plans', 'Tight per-minute token limit'],
   4, 4, 2, 131072, 30, 1000, 8000, 200000, 'var(--color-horizon)', 10, true),
  ('deep-thinker', 'Deep Thinker', 'openai/gpt-oss-120b', 'high', 'OpenAI',
   'Thinks it through before it says a word.',
   'Planning, untangling schedules, coordinating several agents at once.',
   array['Strongest reasoning in the store', 'Catches conflicts and loose ends', 'Great for the agent that runs the show'],
   array['Slowest replies', 'Thinking eats tokens, so it hits limits first', 'Overkill for small talk'],
   5, 2, 1, 131072, 30, 1000, 8000, 200000, 'var(--color-deep-iris)', 20, false),
  ('moonshot', 'Moonshot', 'moonshotai/kimi-k2-instruct', null, 'Moonshot AI',
   'Built to act, not just talk.',
   'Agents that get things done: multi-step tasks, delegating, heavy tool use.',
   array['Top-tier at tool use and agentic work', 'Double the requests per minute', 'Confident, direct voice'],
   array['Can be blunt', 'Mid-pack daily token budget'],
   5, 3, 3, 131072, 60, 1000, 10000, 300000, 'var(--color-cobalt)', 30, false),
  ('scout', 'Scout', 'meta-llama/llama-4-scout-17b-16e-instruct', null, 'Meta',
   'Quick on its feet and hard to tire out.',
   'Busy offices: lots of messages, lots of agents, all day long.',
   array['Most per-minute headroom in the store', 'Fast replies', 'Huge daily budget'],
   array['Shallower reasoning than the big chips', 'Can miss subtle social cues'],
   3, 5, 5, 131072, 30, 1000, 30000, 500000, 'var(--color-pale-iris)', 40, false),
  ('sparkplug', 'Sparkplug', 'openai/gpt-oss-20b', 'low', 'OpenAI',
   'Instant reactions in a small package.',
   'Quick acknowledgements and agents that mostly react.',
   array['Very fast', 'Smarter than its size suggests', 'Clean, reliable tool calls'],
   array['Misses nuance', 'Weaker at juggling several conversations'],
   3, 5, 2, 131072, 30, 1000, 8000, 200000, 'var(--color-cyan-signal)', 50, false),
  ('pocket-genius', 'Pocket Genius', 'openai/gpt-oss-20b', 'medium', 'OpenAI',
   'Small chip, careful mind.',
   'Routines, checklists, and small tasks that need to be right.',
   array['Thinks a beat before acting', 'Still quick', 'Solid pick for scheduled routines'],
   array['Less worldly than the big chips', 'Can overthink simple chatter'],
   3, 4, 2, 131072, 30, 1000, 8000, 200000, 'var(--color-periwinkle)', 60, false),
  ('philosopher', 'Philosopher', 'qwen/qwen3-32b', null, 'Alibaba Qwen',
   'Ponders out loud, answers in any language.',
   'Thoughtful one-on-ones, advice, multilingual households.',
   array['Reasons step by step', 'Strong in dozens of languages', 'Big daily budget'],
   array['Tight per-minute limit', 'Can ramble without a tight brief'],
   4, 3, 3, 131072, 60, 1000, 6000, 500000, 'var(--color-orchid-bloom)', 70, false),
  ('polyglot', 'Polyglot', 'qwen/qwen3.8-27b', null, 'Alibaba Qwen',
   'Warm, fluent, and at home in any language.',
   'Friendly conversation and writing that sounds human, in any language.',
   array['Newest Qwen on Groq', 'Natural, warm voice', 'Tunable thinking'],
   array['Tool use less predictable than the OpenAI chips', 'Limits not published yet'],
   4, 3, 3, 131072, null, null, null, null, 'var(--color-iris-gleam)', 80, false),
  ('old-reliable', 'Old Reliable', 'llama-3.3-70b-versatile', null, 'Meta',
   'The classic. Steady, sensible, well-worn.',
   'Plain, dependable conversation with no surprises.',
   array['Predictable and even-tempered', 'Good general knowledge'],
   array['Smallest daily budget in the store', 'Older generation, less sharp with tools'],
   3, 3, 1, 131072, 30, 1000, 12000, 100000, 'var(--color-steel)', 90, false),
  ('marathoner', 'Marathoner', 'llama-3.1-8b-instant', null, 'Meta',
   'Tiny, instant, runs forever.',
   'Simple agents that react, confirm, and pass things along.',
   array['14,400 requests a day, by far the most', 'Near-instant', 'Barely touches your budget'],
   array['The least capable chip', 'Loses the thread in long conversations', 'Tight per-minute token limit'],
   1, 5, 4, 131072, 30, 14400, 6000, 500000, 'var(--color-silver)', 100, false);

-- Red light on an agent: set when every brain (slotted chip, default chip, Claude) failed on a turn,
-- cleared on the next turn that works. Written by Edge Functions only.
alter table public.agents add column model_error text, add column model_error_at timestamptz;
-- Which brain actually answered last, so the drawer can say "running on backup".
alter table public.agents add column last_model text;
