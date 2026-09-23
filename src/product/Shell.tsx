import { useEffect, useRef, useState } from 'react';
import { AgentAvatar, Button, GlassTabBar, Icon, MonoLabel, SideRail, Wordmark, cx } from '@/ds';
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
import { HUMAN_TONE } from './ui';

const VIEWS = [
  { id: 'agents', label: 'Agents', icon: 'users' as const },
  { id: 'office', label: 'Office', icon: 'message-circle' as const },
  { id: 'activity', label: 'Activity', icon: 'activity' as const },
  { id: 'people', label: 'People', icon: 'user-plus' as const },
  { id: 'settings', label: 'Settings', icon: 'settings' as const },
];

/** `#/app/<view>/<id>` inside a signed-in office. */
export function Shell({ view, id }: { view: string; id?: string }) {
  const { session, profile, signOut } = useAuth();
  const { office, agents, members, conversations } = useOffice();
  const mine = agents.filter((a) => a.owner_id === session?.user.id).length;
  const narrow = useNarrow();
  const scroller = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  const active = VIEWS.some((v) => v.id === view) ? view : 'agents';
  const fill = active === 'office';
  const title = VIEWS.find((v) => v.id === active)!.label;

  // New view → back to the top.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [active]);

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
      label: 'Office',
      items: [
        { id: 'people', label: 'People', icon: 'user-plus' as const, count: members.length },
        { id: 'settings', label: 'Settings', icon: 'settings' as const },
      ],
    },
  ];

  return (
    <div className="p-app">
      {narrow ? null : (
        <SideRail
          sections={sections}
          active={active}
          onSelect={(next) => navigate(`/app/${next}`)}
          header={
            <div className="p-rail-head">
              <a href="#/app" aria-label="Caden" className="p-rail-head__mark"><Wordmark size={24} /></a>
              <button type="button" className="p-office-chip" onClick={() => navigate('/app/settings')}>
                <span className="p-office-chip__tone" style={{ background: office?.tone }} />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, textAlign: 'left' }}>
                  <span className="p-office-chip__name">{office?.name ?? 'No office'}</span>
                  <MonoLabel size="tiny" tone="var(--text-muted)">{`${members.length} ${members.length === 1 ? 'person' : 'people'} · ${agents.length} ${agents.length === 1 ? 'agent' : 'agents'}`}</MonoLabel>
                </span>
                <Icon name="chevron-right" size={16} tone="muted" />
              </button>
            </div>
          }
          footer={
            <div className="p-me">
              <AgentAvatar name={profile?.display_name || 'You'} tone={HUMAN_TONE} size="sm" />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                <span className="p-me__name">{profile?.display_name || 'You'}</span>
                <MonoLabel size="tiny" tone="var(--text-muted)" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.email ?? ''}</MonoLabel>
              </div>
              <Button variant="text" size="sm" icon="log-out" aria-label="Sign out" title="Sign out" onClick={() => signOut()} />
            </div>
          }
        />
      )}
      <div className="p-main">
        <header className={cx('p-topbar', narrow && 'p-topbar--narrow')} data-scrolled={scrolled || fill || undefined}>
          {narrow ? (
            <a href="#/app" aria-label="Caden"><Wordmark size={22} /></a>
          ) : (
            <div className="p-crumbs">
              <span className="p-crumbs__dot" style={{ background: office?.tone }} />
              <MonoLabel size="tiny" tone="var(--text-muted)">{office?.name}</MonoLabel>
              <MonoLabel size="tiny" tone="var(--text-muted)">/</MonoLabel>
              <MonoLabel key={title} size="tiny" tone="var(--color-cloud)" className="c-enter">{title}</MonoLabel>
            </div>
          )}
          <div className="p-topbar__actions">
            <Button variant="glass" size="sm" icon="user-plus" onClick={() => navigate('/app/people')} className={narrow ? undefined : 'p-hide-md'} aria-label="Invite">{narrow ? undefined : 'Invite'}</Button>
            <Button variant="primary" size="sm" icon={narrow ? 'plus' : undefined} arrow={!narrow} href="#/app/agents/new" aria-label="Create an agent">{narrow ? undefined : 'Create an agent'}</Button>
          </div>
        </header>
        <div ref={scroller} className={cx('p-scroll', fill && !narrow && 'p-scroll--fill')} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}>
          <div key={active} className={cx('p-content', 'c-view', fill && !narrow && 'p-content--fill')}>
            {active === 'agents' ? <AgentsHome /> : null}
            {active === 'office' ? <OfficeView conversationId={id === 'new' ? undefined : id} composing={id === 'new'} /> : null}
            {active === 'activity' ? <ActivityView /> : null}
            {active === 'people' ? <PeopleView /> : null}
            {active === 'settings' ? <SettingsView /> : null}
          </div>
        </div>
      </div>
      {narrow ? (
        <div className="p-tabbar">
          <GlassTabBar items={VIEWS} active={active} onSelect={(next) => navigate(`/app/${next}`)} style={{ background: 'rgba(30,31,32,0.72)' }} />
        </div>
      ) : null}
      {active === 'agents' && id ? <AgentDrawer key={id} agentId={id} onClose={() => navigate('/app/agents')} /> : null}
    </div>
  );
}
