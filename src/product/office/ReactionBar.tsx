import { useState } from 'react';
import { MonoLabel } from '@/ds';
import { supabase } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { useOffice } from '@/lib/office';
import { REACTIONS, type Reaction, type ReactionWord } from '@/lib/types';

const LABEL: Record<ReactionWord, string> = { seen: 'Seen', agree: 'Agree', on_it: 'On it', done: 'Done', thanks: 'Thanks', disagree: 'Disagree' };

const chip = (on: boolean) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--spacing-4)',
  padding: '3px 10px',
  borderRadius: 'var(--radius-pill)',
  border: on ? 'var(--border-glass)' : 'var(--border-hairline)',
  background: on ? 'var(--surface-glass)' : 'transparent',
  cursor: 'pointer',
  transition: 'var(--transition-state)',
});

/**
 * Word reactions under a message ("AGREE · Maya, Zeph"). Agents add theirs server-side;
 * people toggle their own here.
 */
export function ReactionBar({
  messageId,
  reactions,
  me,
  onLocal,
  onError,
}: {
  messageId: string;
  reactions: Reaction[];
  me: string | undefined;
  onLocal: (change: { add?: Reaction; removeId?: string }) => void;
  onError: (message: string) => void;
}) {
  const { agentById, memberById } = useOffice();
  const [picking, setPicking] = useState(false);
  const mine = reactions.filter((r) => r.message_id === messageId);
  const grouped = REACTIONS.map((word) => ({ word, list: mine.filter((r) => r.reaction === word) })).filter((g) => g.list.length);

  const who = (r: Reaction) => (r.agent_id ? agentById(r.agent_id)?.name ?? 'An agent' : r.user_id === me ? 'You' : memberById(r.user_id)?.profile?.display_name ?? 'Someone');

  const toggle = async (word: ReactionWord) => {
    setPicking(false);
    const existing = mine.find((r) => r.reaction === word && r.user_id === me);
    if (existing) {
      onLocal({ removeId: existing.id });
      const { error } = await supabase.from('message_reactions').delete().eq('id', existing.id);
      if (error) onError(errorCopy(error));
      return;
    }
    const { data, error } = await supabase.from('message_reactions').insert({ message_id: messageId, user_id: me, reaction: word }).select('*').single();
    if (error) onError(errorCopy(error));
    else onLocal({ add: data as Reaction });
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-4)', alignItems: 'center' }}>
      {grouped.map(({ word, list }) => (
        <button key={word} type="button" onClick={() => toggle(word)} title={list.map(who).join(', ')} style={chip(list.some((r) => r.user_id === me))}>
          <MonoLabel size="tiny" tone="var(--color-cloud)">{LABEL[word]}</MonoLabel>
          <MonoLabel size="tiny" tone="var(--text-muted)">{`· ${list.map(who).join(', ')}`}</MonoLabel>
        </button>
      ))}
      {picking ? (
        REACTIONS.map((word) => (
          <button key={word} type="button" onClick={() => toggle(word)} style={chip(false)}>
            <MonoLabel size="tiny">{LABEL[word]}</MonoLabel>
          </button>
        ))
      ) : (
        <button type="button" onClick={() => setPicking(true)} aria-label="React" style={{ ...chip(false), border: '1px solid transparent', opacity: 0.6 }}>
          <MonoLabel size="tiny" tone="var(--text-muted)">React</MonoLabel>
        </button>
      )}
    </div>
  );
}
