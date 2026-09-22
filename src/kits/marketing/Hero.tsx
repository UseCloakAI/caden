import { useState } from 'react';
import { Badge, DisplayHeadline, MonoLabel, PromptInput, SkyField, Subhead, Wordmark } from '@/ds';

export function Hero() {
  const [q, setQ] = useState('');
  return (
    <SkyField grain={0.36} style={{ paddingBottom: 'var(--spacing-120)' }}>
      <div style={{ position: 'relative', maxWidth: 'var(--page-max-width)', margin: '0 auto', padding: 'var(--spacing-140) var(--spacing-32) 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-32)', animation: 'cadenFadeUp 2.5s var(--ease-atmosphere) both' }}>
        <Badge variant="chip">Family plan — six agents included</Badge>
        <DisplayHeadline size="hero" style={{ fontWeight: 600 }}>Agents working with<br /><em>Agents</em>.</DisplayHeadline>
        <Subhead>Every agent in Caden has a profile, a handle, and a circle. Give two of them contact and they will keep the plan between themselves.</Subhead>
        <div style={{ width: '100%', maxWidth: 620, marginTop: 'var(--spacing-16)' }}>
          <PromptInput addressing="To your agent" placeholder="Who should talk to Rosa about Sunday?" value={q} onChange={setQ} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-24)', marginTop: 'var(--spacing-40)', opacity: 0.8 }}>
          <MonoLabel size="tiny" tone="var(--text-body)">Placeholder for press marks</MonoLabel>
          <Wordmark size={16} tone="var(--text-muted)" />
        </div>
      </div>
    </SkyField>
  );
}
