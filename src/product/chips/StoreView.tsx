import { useState } from 'react';
import { Badge, Button, Icon, MonoLabel, useToast, type StyleVars } from '@/ds';
import { chipTag, useChips } from '@/lib/chips';
import { errorCopy } from '@/lib/errors';
import type { ModelChip } from '@/lib/types';
import { ErrorLine, PageHeader } from '../ui';
import { Chip, Pips } from './Chip';

const compact = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));

function limits(c: ModelChip) {
  if (c.rpm == null) return 'Free-tier limits not published yet';
  return [`${c.rpm} req/min`, `${c.rpd!.toLocaleString()} req/day`, `${compact(c.tpm!)} tokens/min`, `${compact(c.tpd!)} tokens/day`].join(' · ');
}

/** Every Groq brain an agent can run on. Adding one is free: it just lands in your library. */
export function StoreView() {
  const { chips, has, add, remove, loading } = useChips();
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = filter === 'mine' ? chips.filter(has) : chips;

  const toggle = async (c: ModelChip) => {
    setBusy(c.id);
    setError(null);
    const owned = has(c);
    const err = owned ? await remove(c.id) : await add(c.id);
    setBusy(null);
    if (err) setError(errorCopy(err));
    else toast(owned ? `${c.name} left your library. Agents using it went back to the default brain.` : `${c.name} is in your library. Slot it into an agent.`, { icon: 'cpu' });
  };

  return (
    <div className="p-stack">
      <PageHeader
        eyebrow={`Store · ${chips.length} brains · ${chips.filter(has).length} in your library`}
        title={<>Pick a <em>brain</em>.</>}
        sub="Every chip is a model your agents can run on, all free on Groq. Add one to your library, then open an agent and drag it into the brain slot. If a brain is busy or fails, the agent falls back to the default, then to Claude."
        action={
          <div className="p-store-filter">
            <Button variant={filter === 'all' ? 'primary' : 'ghost'} size="sm" onClick={() => setFilter('all')}>All</Button>
            <Button variant={filter === 'mine' ? 'primary' : 'ghost'} size="sm" onClick={() => setFilter('mine')}>Your library</Button>
          </div>
        }
      />
      <ErrorLine>{error}</ErrorLine>
      {loading ? <MonoLabel size="tiny" tone="var(--text-muted)">Stocking the shelves…</MonoLabel> : null}
      <div className="p-store-grid">
        {shown.map((c, i) => (
          <article key={c.id} className="p-store-card" style={{ '--chip': c.tone, '--i': i } as StyleVars}>
            <span className="p-store-card__glow" aria-hidden="true" />
            <div className="p-store-card__head">
              <Chip chip={c} size="lg" />
              <div className="p-store-card__title">
                <span className="p-store-card__name">
                  {c.name}
                  <MonoLabel size="tiny" tone="var(--text-muted)">{chipTag(c)}</MonoLabel>
                </span>
                <MonoLabel size="tiny" tone="var(--text-muted)">{c.maker}</MonoLabel>
                <p className="p-store-card__tagline">{c.tagline}</p>
              </div>
            </div>

            <p className="p-best"><MonoLabel size="tiny" tone="var(--color-cloud)">Best at · </MonoLabel>{c.best_at}</p>

            <div className="p-stats">
              {([['Smarts', c.smarts], ['Speed', c.speed], ['Stamina', c.stamina]] as const).map(([label, v]) => (
                <div key={label} className="p-stat">
                  <MonoLabel size="tiny" tone="var(--text-muted)">{label}</MonoLabel>
                  <Pips value={v} />
                </div>
              ))}
            </div>

            <div className="p-proscons">
              <ul aria-label="Pros">
                {c.pros.map((p) => (
                  <li key={p}><Icon name="check" size={16} tone="pure" />{p}</li>
                ))}
              </ul>
              <ul aria-label="Cons">
                {c.cons.map((p) => (
                  <li key={p}><Icon name="minus" size={16} tone="muted" />{p}</li>
                ))}
              </ul>
            </div>

            <MonoLabel size="tiny" tone="var(--text-muted)">{limits(c)}</MonoLabel>

            <div className="p-store-card__foot">
              <div style={{ display: 'flex', gap: 'var(--spacing-8)', flexWrap: 'wrap' }}>
                {c.is_default ? <Badge variant="quiet" dot="live">Default brain</Badge> : null}
                {has(c) && !c.is_default ? <Badge variant="quiet" dot="live">In your library</Badge> : null}
                {!c.live ? <Badge variant="quiet" dot="var(--color-fog)">Offline on Groq</Badge> : null}
              </div>
              {c.is_default ? (
                <MonoLabel size="tiny" tone="var(--text-muted)">Every agent has it</MonoLabel>
              ) : has(c) ? (
                <Button variant="text" size="sm" icon="minus" loading={busy === c.id} onClick={() => toggle(c)}>Remove</Button>
              ) : (
                <Button variant="primary" size="sm" icon="plus" loading={busy === c.id} disabled={!c.live} onClick={() => toggle(c)}>Add to library</Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
