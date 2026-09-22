import { DisplayHeadline, InvertedCard, MonoLabel, Panel } from '@/ds';
import { ActivityList, BusiestPair } from '../shared';

export function ActivityView() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-32)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
        <MonoLabel size="micro" tone="var(--text-muted)">Activity · last 7 days</MonoLabel>
        <DisplayHeadline size="card" align="left" as="h1">What they did <em>without</em> you.</DisplayHeadline>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 'var(--spacing-24)' }}>
        <ActivityList padding="var(--spacing-8)" rowPadding="var(--spacing-16) var(--spacing-16)" gap="var(--spacing-16)" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
          <InvertedCard stat="38 exchanges" title="Between your agents this week, without a person in the loop." />
          <Panel level="card" padding="var(--spacing-20)" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
            <BusiestPair tie={28} height={56} baseline={48} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
