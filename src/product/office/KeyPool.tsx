import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, MonoLabel, TextField, useToast } from '@/ds';
import { supabase, callFunction } from '@/lib/supabase';
import { errorCopy } from '@/lib/errors';
import { ErrorLine, Section } from '../ui';

interface KeyStats {
  healthy: number;
  cooling_down: number;
}

/** A donated-key pool section — Groq for chat, Tavily for search. Same shape, different provider. */
export function KeyPool({
  provider,
  title,
  description,
  fieldLabel,
  placeholder,
  thanks,
}: {
  provider: 'groq' | 'tavily';
  title: string;
  description: string;
  fieldLabel: string;
  placeholder: string;
  thanks: string;
}) {
  const toast = useToast();
  const [stats, setStats] = useState<KeyStats | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(() => {
    supabase.rpc('provider_key_stats', { p_provider: provider }).maybeSingle().then(({ data }) => setStats(data as KeyStats | null));
  }, [provider]);

  useEffect(() => {
    load();
  }, [load]);

  const donate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const res = await callFunction('donate-key', { api_key: key.trim(), provider });
    setBusy(false);
    if (res.error) setStatus(errorCopy(res.error));
    else {
      setKey('');
      setStatus(thanks);
      toast('Key donated. Thanks for helping power the pool.');
      load();
    }
  };

  return (
    <Section title={title} description={description}>
      <MonoLabel size="tiny" tone="var(--text-muted)">
        {stats ? `${stats.healthy} keys ready · ${stats.cooling_down} resting` : 'Checking pool…'}
      </MonoLabel>
      <form onSubmit={donate} className="p-form" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <TextField label={fieldLabel} type="password" value={key} onChange={setKey} placeholder={placeholder} required style={{ flex: 1, minWidth: 220 }} />
        <Button variant="ghost" type="submit" loading={busy} disabled={!key.trim()}>Donate key</Button>
      </form>
      <ErrorLine>{status}</ErrorLine>
    </Section>
  );
}
