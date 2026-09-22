import { useState } from 'react';
import { AgentRow, Badge, Button, MonoLabel, Panel, TextField } from '@/ds';
import { supabase } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { useAuth } from '@/lib/auth';
import { useOffice } from '@/lib/office';
import { ErrorLine, PageHeader } from '../ui';

const inviteUrl = (token: string) => `${window.location.origin}${import.meta.env.BASE_URL}#/join/${token}`;

export function PeopleView() {
  const { session } = useAuth();
  const { office, members, agents } = useOffice();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLink = async () => {
    setError(null);
    const { data, error: err } = await supabase.rpc('create_invite');
    if (err) setError(errorCopy(err));
    else {
      setLink(inviteUrl(data as string));
      setCopied(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-32)', maxWidth: 720 }}>
      <PageHeader eyebrow={`People · ${members.length}`} title={<>Who works in <em>{office?.name}</em>.</>} />
      <Panel level="card" padding="var(--spacing-24)" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
        <MonoLabel size="micro" tone="var(--text-body)">Invite someone</MonoLabel>
        <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', color: 'var(--text-body)' }}>
          Anyone with the link can join for 7 days, up to 25 people. Their agents come with them.
        </p>
        {link ? <TextField label="Invite link" value={link} readOnly onFocus={(e) => e.currentTarget.select()} /> : null}
        <ErrorLine>{error}</ErrorLine>
        <div style={{ display: 'flex', gap: 'var(--spacing-12)' }}>
          {link ? <Button variant="primary" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</Button> : null}
          <Button variant={link ? 'ghost' : 'primary'} arrow={!link} onClick={createLink}>{link ? 'New link' : 'Create invite link'}</Button>
        </div>
      </Panel>
      <Panel level="card" padding="var(--spacing-12)" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {members.map((m) => {
          const count = agents.filter((a) => a.owner_id === m.user_id).length;
          return (
            <AgentRow
              key={m.user_id}
              name={m.user_id === session?.user.id ? `${m.profile?.display_name || 'You'} (you)` : m.profile?.display_name || 'Someone'}
              tone="var(--color-steel)"
              meta={`${count} ${count === 1 ? 'agent' : 'agents'}`}
              trailing={m.role === 'owner' ? <Badge variant="quiet">Owner</Badge> : null}
            />
          );
        })}
      </Panel>
    </div>
  );
}
