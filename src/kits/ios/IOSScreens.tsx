import { useState, type ReactNode } from 'react';
import {
  AgentAvatar, Badge, Button, CircleTile, ContactLink, DisplayHeadline, GlassSurface, GlassTabBar,
  Icon, Message, MonoLabel, Panel, PromptInput, Switch,
} from '@/ds';
import { agentById, agents, circles, contacts, thread, type Turn } from '../data';
import { ActivityList, BusiestPair } from '../shared';
import { IOSDevice } from './IOSDevice';

function GlassHeader({ eyebrow, title, trailing }: { eyebrow: string; title: string; trailing?: ReactNode }) {
  return (
    <GlassSurface
      variant="bar"
      radius={0}
      padding="52px 20px 14px"
      style={{ borderWidth: '0 0 1px', display: 'flex', alignItems: 'flex-end', gap: 12, position: 'sticky', top: 0, zIndex: 20 }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <MonoLabel size="tiny" tone="var(--text-muted)">{eyebrow}</MonoLabel>
        <DisplayHeadline size="card" align="left" as="h1" style={{ fontSize: 34, fontWeight: 600 }}>{title}</DisplayHeadline>
      </div>
      {trailing}
    </GlassSurface>
  );
}

function AgentsScreen({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <div>
      <GlassHeader
        eyebrow={`Your agents · ${agents.length}`}
        title="Agents"
        trailing={<GlassSurface variant="pill" padding="9px" style={{ display: 'grid', placeItems: 'center' }}><Icon name="user-plus" size={18} /></GlassSurface>}
      />
      <div style={{ padding: '18px 16px 150px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {agents.map((a) => (
          <Panel key={a.id} level="card" padding="16px" radius="22px" onClick={() => onOpen(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
            <AgentAvatar name={a.name} tone={a.tone} size="lg" active={a.status === 'Active'} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 17, color: 'var(--color-pure)' }}>{a.name}</span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.4, color: 'var(--text-body)' }}>{a.role}</span>
              <MonoLabel size="tiny" tone="var(--text-muted)">{`${a.handle} · ${a.status}`}</MonoLabel>
            </div>
            <Icon name="chevron-right" size={18} tone="muted" />
          </Panel>
        ))}
        <MonoLabel size="tiny" tone="var(--text-muted)" style={{ padding: '4px 4px' }}>Contact between agents</MonoLabel>
        {contacts.slice(0, 3).map((c) => (
          <ContactLink key={c.from + c.to} from={agentById(c.from)} to={agentById(c.to)} state={c.state} style={{ borderRadius: 22 }}>
            <Switch checked={c.state === 'on'} />
          </ContactLink>
        ))}
      </div>
    </div>
  );
}

function CirclesScreen({ openCircle, onOpenCircle }: { openCircle: string | null; onOpenCircle: (id: string | null) => void }) {
  const circle = circles.find((c) => c.id === openCircle);
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>(thread);

  if (!circle) {
    return (
      <div>
        <GlassHeader eyebrow={`Circles · ${circles.length}`} title="Circles" />
        <div style={{ padding: '18px 16px 150px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {circles.map((c) => (
            <CircleTile key={c.id} name={c.name} tone={c.tone} note={c.note} members={c.members.map(agentById)} onClick={() => onOpenCircle(c.id)} style={{ minHeight: 180, borderRadius: 26 }} />
          ))}
        </div>
      </div>
    );
  }

  const send = () => {
    if (!draft.trim()) return;
    setTurns([...turns, { kind: 'you', time: 'Now', body: draft }]);
    setDraft('');
  };

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <GlassSurface variant="bar" radius={0} padding="52px 16px 12px" style={{ borderWidth: '0 0 1px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 20 }}>
        <button onClick={() => onOpenCircle(null)} aria-label="Back" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
          <Icon name="chevron-right" size={22} style={{ transform: 'scaleX(-1)' }} />
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22, color: 'var(--color-pure)' }}>{circle.name}</span>
          <MonoLabel size="tiny" tone="var(--text-muted)">{`Circle of ${circle.members.length}`}</MonoLabel>
        </div>
        <div style={{ display: 'flex' }}>
          {circle.members.map((id, i) => {
            const a = agentById(id);
            return <div key={id} style={{ marginLeft: i === 0 ? 0 : -8 }}><AgentAvatar name={a.name} tone={a.tone} size="sm" /></div>;
          })}
        </div>
      </GlassSurface>
      <div style={{ flex: 1, padding: '18px 16px 170px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {turns.map((t, i) => {
          const a = t.id ? agentById(t.id) : null;
          return (
            <Message key={i} kind={t.kind} author={a ? a.name : t.kind === 'you' ? 'You' : undefined} tone={a?.tone} time={t.time} style={{ maxWidth: '100%' }}>
              {t.body}
            </Message>
          );
        })}
      </div>
      <GlassSurface variant="bar" floating padding="10px" style={{ position: 'absolute', left: 16, right: 16, bottom: 104 }}>
        <PromptInput addressing="To the circle" value={draft} onChange={setDraft} onSubmit={send} placeholder="Ask an agent to handle it…" style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.12)' }} />
      </GlassSurface>
    </div>
  );
}

function ActivityScreen() {
  return (
    <div>
      <GlassHeader eyebrow="Activity · last 7 days" title="Activity" />
      <div style={{ padding: '18px 16px 150px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ActivityList padding="6px" radius="22px" rowPadding="14px 14px" gap="var(--spacing-12)" />
        <Panel level="card" padding="18px" radius="22px" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <BusiestPair tie={24} height={50} baseline={44} />
        </Panel>
      </div>
    </div>
  );
}

function AgentSheet({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const agent = agents.find((a) => a.id === agentId);
  const others = agents.filter((a) => a.id !== agentId);
  const [allowed, setAllowed] = useState(others.map((_, i) => i < 2));
  if (!agent) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(9,10,11,0.55)', backdropFilter: 'blur(6px)' }} />
      <GlassSurface variant="sheet" padding="10px 16px 40px" style={{ position: 'relative', borderWidth: '1px 0 0', borderRadius: '38px 38px 0 0', background: 'rgba(30,30,32,0.72)', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '86%', overflowY: 'auto' }}>
        <div style={{ width: 38, height: 5, borderRadius: 9999, background: 'rgba(255,255,255,0.35)', margin: '4px auto 8px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <AgentAvatar name={agent.name} tone={agent.tone} size="lg" active={agent.status === 'Active'} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 28, lineHeight: 1, color: 'var(--color-pure)' }}>{agent.name}</span>
            <MonoLabel size="tiny" tone="var(--text-muted)">{`${agent.handle} · ${agent.belongsTo}`}</MonoLabel>
          </div>
        </div>
        <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 300, fontSize: 16, lineHeight: 1.5, color: 'var(--text-body)' }}>{agent.role}</p>
        <MonoLabel size="tiny" tone="var(--text-muted)">May contact</MonoLabel>
        {others.map((o, i) => (
          <ContactLink key={o.id} from={agent} to={o} state={allowed[i] ? 'on' : 'off'} style={{ background: 'rgba(0,0,0,0.35)', borderRadius: 22 }}>
            <Switch checked={allowed[i]} onChange={(n) => setAllowed(allowed.map((v, j) => (j === i ? n : v)))} />
          </ContactLink>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
          <Badge variant="quiet"><Icon name="shield" size={16} tone="muted" />Household plan</Badge>
          <Button variant="primary" arrow style={{ marginLeft: 'auto', borderRadius: 22 }}>Save</Button>
        </div>
      </GlassSurface>
    </div>
  );
}

const TABS = [
  { id: 'agents', label: 'Agents', icon: 'users' as const },
  { id: 'circles', label: 'Circles', icon: 'link-2' as const },
  { id: 'activity', label: 'Activity', icon: 'activity' as const },
];

export function CadenIOS() {
  const [tab, setTab] = useState('agents');
  const [openCircle, setOpenCircle] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-sunken)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <IOSDevice>
        <div style={{ position: 'absolute', inset: 0, background: 'var(--surface-canvas)', overflowY: 'auto' }}>
          {tab === 'agents' ? <AgentsScreen onOpen={setSheet} /> : null}
          {tab === 'circles' ? <CirclesScreen openCircle={openCircle} onOpenCircle={setOpenCircle} /> : null}
          {tab === 'activity' ? <ActivityScreen /> : null}
        </div>
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 28, zIndex: 30 }}>
          <GlassTabBar
            active={tab}
            onSelect={(id) => {
              setTab(id);
              setOpenCircle(null);
            }}
            items={TABS}
          />
        </div>
        {sheet ? <AgentSheet agentId={sheet} onClose={() => setSheet(null)} /> : null}
      </IOSDevice>
    </div>
  );
}
