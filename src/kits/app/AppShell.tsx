import { useState } from 'react';
import { AgentRow, Badge, Button, NavBar, SideRail } from '@/ds';
import { agents, circles } from '../data';
import { AgentsView } from './AgentsView';
import { CirclesView } from './CirclesView';
import { ActivityView } from './ActivityView';
import { AgentDetail } from './AgentDetail';

const SECTIONS = [
  {
    label: 'Yours',
    items: [
      { id: 'agents', label: 'Agents', icon: 'users' as const, count: agents.length },
      { id: 'circles', label: 'Circles', icon: 'link-2' as const, count: circles.length },
      { id: 'activity', label: 'Activity', icon: 'activity' as const },
    ],
  },
  {
    label: 'Household',
    items: [
      { id: 'people', label: 'People', icon: 'user-plus' as const, count: 4 },
      { id: 'settings', label: 'Settings', icon: 'settings' as const },
    ],
  },
];

export function AppShell() {
  const [view, setView] = useState('agents');
  const [openCircle, setOpenCircle] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  return (
    <div style={{ position: 'relative', display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--surface-canvas)' }}>
      <SideRail
        sections={SECTIONS}
        active={view}
        onSelect={(id) => {
          setView(id);
          setOpenCircle(null);
        }}
        footer={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
            <Badge variant="quiet">Household plan</Badge>
            <AgentRow name="You" tone="var(--color-steel)" meta="ana@caden.family" />
          </div>
        }
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <NavBar
          items={['Search', 'Invite']}
          trailing={
            <>
              <Button variant="glass" icon="bell" aria-label="Notifications" />
              <Button variant="primary" arrow onClick={() => setView('agents')}>Create an agent</Button>
            </>
          }
        />
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--spacing-40) var(--spacing-40) var(--spacing-48)' }}>
          <div style={{ maxWidth: 'var(--page-max-width)', margin: '0 auto', height: '100%' }}>
            {view === 'agents' ? <AgentsView onOpen={setDetail} /> : null}
            {view === 'circles' ? <CirclesView openCircle={openCircle} onOpenCircle={setOpenCircle} /> : null}
            {view === 'activity' ? <ActivityView /> : null}
            {view === 'people' || view === 'settings' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)', paddingTop: 'var(--spacing-40)' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 38, lineHeight: 0.9, color: 'var(--color-pure)' }}>Not in this kit.</span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-md)', color: 'var(--text-body)' }}>No source design was provided for this view, so it is left blank rather than invented.</span>
              </div>
            ) : null}
          </div>
        </div>
      </main>
      {detail ? <AgentDetail agentId={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}
