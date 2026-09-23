import { AgentRow, Badge, Button, NavBar, SideRail } from '@/ds';
import { useAuth } from '@/lib/auth';
import { useOffice } from '@/lib/office';
import { navigate } from '@/lib/router';
import { useNarrow } from '@/lib/useNarrow';
import { AgentsHome } from './agents/AgentsHome';
import { AgentDrawer } from './agents/AgentDrawer';
import { OfficeView } from './office/OfficeView';
import { ActivityView } from './office/ActivityView';
import { PeopleView } from './office/PeopleView';
import { SettingsView } from './office/SettingsView';

const NARROW_NAV = [
  { id: 'agents', label: 'Agents' },
  { id: 'office', label: 'Office' },
  { id: 'activity', label: 'Activity' },
  { id: 'people', label: 'People' },
  { id: 'settings', label: 'Settings' },
];

/** `#/app/<view>/<id>` inside a signed-in office. */
export function Shell({ view, id }: { view: string; id?: string }) {
  const { session, profile } = useAuth();
  const { office, agents, members, conversations } = useOffice();
  const mine = agents.filter((a) => a.owner_id === session?.user.id).length;
  const narrow = useNarrow();

  const sections = [
    {
      label: 'Yours',
      items: [
        { id: 'agents', label: 'Agents', icon: 'users' as const, count: mine },
        { id: 'office', label: 'Office', icon: 'message-circle' as const, count: conversations.length },
        { id: 'activity', label: 'Activity', icon: 'activity' as const },
      ],
    },
    {
      label: office?.name ?? 'Office',
      items: [
        { id: 'people', label: 'People', icon: 'user-plus' as const, count: members.length },
        { id: 'settings', label: 'Settings', icon: 'settings' as const },
      ],
    },
  ];

  const active = view || 'agents';

  return (
    <div style={{ position: 'relative', display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--surface-canvas)' }}>
      {narrow ? null : <SideRail
        sections={sections}
        active={active}
        onSelect={(next) => navigate(`/app/${next}`)}
        footer={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
            <Badge variant="quiet">{office?.name ?? 'No office'}</Badge>
            <AgentRow name={profile?.display_name || 'You'} tone="var(--color-steel)" meta={profile?.email ?? ''} onClick={() => navigate('/app/settings')} />
          </div>
        }
      />}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {narrow ? (
          <NavBar
            items={NARROW_NAV.map((n) => n.label)}
            active={NARROW_NAV.find((n) => n.id === active)?.label}
            onSelect={(label) => navigate(`/app/${NARROW_NAV.find((n) => n.label === label)!.id}`)}
            style={{ overflowX: 'auto' }}
          />
        ) : (
          <NavBar
            items={['Invite']}
            onSelect={() => navigate('/app/people')}
            trailing={<Button variant="primary" arrow href="#/app/agents/new">Create an agent</Button>}
          />
        )}
        <div style={{ flex: 1, minHeight: 0, overflowY: active === 'office' && !narrow ? 'hidden' : 'auto', padding: narrow ? 'var(--spacing-20) var(--spacing-16) var(--spacing-32)' : 'var(--spacing-40) var(--spacing-40) var(--spacing-48)' }}>
          <div style={{ maxWidth: 'var(--page-max-width)', margin: '0 auto', height: '100%' }}>
            {active === 'agents' ? <AgentsHome /> : null}
            {active === 'office' ? <OfficeView conversationId={id === 'new' ? undefined : id} composing={id === 'new'} /> : null}
            {active === 'activity' ? <ActivityView /> : null}
            {active === 'people' ? <PeopleView /> : null}
            {active === 'settings' ? <SettingsView /> : null}
          </div>
        </div>
      </main>
      {active === 'agents' && id ? <AgentDrawer key={id} agentId={id} onClose={() => navigate('/app/agents')} /> : null}
    </div>
  );
}
