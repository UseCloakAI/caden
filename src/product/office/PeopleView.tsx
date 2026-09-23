import { useState } from 'react';
import { AgentAvatar, AvatarStack, Badge, Button, MonoLabel, TextField, useToast, type StyleVars } from '@/ds';
import { supabase } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { useAuth } from '@/lib/auth';
import { useOffice } from '@/lib/office';
import { ErrorLine, HUMAN_TONE, PageHeader, Section } from '../ui';

const inviteUrl = (token: string) => `${window.location.origin}${import.meta.env.BASE_URL}#/join/${token}`;

export function PeopleView() {
  const { session } = useAuth();
  const toast = useToast();
  const { office, members, agents } = useOffice();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLink = async () => {
    setError(null);
    setBusy(true);
    const { data, error: err } = await supabase.rpc('create_invite');
    setBusy(false);
    if (err) setError(errorCopy(err));
    else {
      setLink(inviteUrl(data as string));
      setCopied(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast('Invite link copied.', { icon: 'copy' });
      setTimeout(() => setCopied(false), 2400);
    } catch {
      setError('Copy did not work here. Select the link and copy it.');
    }
  };

  return (
    <div className="p-stack p-narrow-page">
      <PageHeader eyebrow={`People · ${members.length}`} title={<>Who works in <em>{office?.name}</em>.</>} sub="Everyone here can read every conversation, and their agents can talk to yours." />

      <Section title="Invite someone" description="Anyone with the link can join for 7 days, up to 25 people. Their agents come with them.">
        {link ? (
          <TextField
            label="Invite link"
            value={link}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            trailing={<Button variant={copied ? 'glass' : 'primary'} size="sm" icon={copied ? 'check' : 'copy'} onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>}
            className="c-enter"
          />
        ) : null}
        <ErrorLine>{error}</ErrorLine>
        <div style={{ display: 'flex', gap: 'var(--spacing-12)' }}>
          <Button variant={link ? 'ghost' : 'primary'} icon={link ? undefined : 'link-2'} arrow={!link} loading={busy} onClick={createLink}>{link ? 'Make a new link' : 'Create invite link'}</Button>
        </div>
      </Section>

      <Section title={`Members · ${members.length}`}>
        <div className="p-stack c-stagger" style={{ gap: 2 }}>
          {members.map((m, i) => {
            const theirs = agents.filter((a) => a.owner_id === m.user_id);
            const you = m.user_id === session?.user.id;
            const name = m.profile?.display_name || (you ? 'You' : 'Someone');
            return (
              <div key={m.user_id} className="p-person" style={{ '--i': i } as StyleVars}>
                <AgentAvatar name={name} tone={HUMAN_TONE} size="md" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                  <span className="p-person__name">
                    {name}
                    {you ? <MonoLabel size="tiny" tone="var(--text-muted)">You</MonoLabel> : null}
                  </span>
                  <MonoLabel size="tiny" tone="var(--text-muted)">{`${theirs.length} ${theirs.length === 1 ? 'agent' : 'agents'} · Joined ${new Date(m.joined_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}</MonoLabel>
                </div>
                {theirs.length ? <AvatarStack people={theirs.map((a) => ({ name: a.name, tone: a.tone }))} size="sm" max={4} ring="var(--surface-card)" /> : null}
                {m.role === 'owner' ? <Badge variant="quiet">Owner</Badge> : null}
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
