import { useEffect, useState, type ReactNode } from 'react';
import { AgentAvatar, AgentRow, AvatarStack, Message, MonoLabel, TypingIndicator, cx, useInView, type StyleVars } from '@/ds';
import { DEMO_AGENTS, HOLD, SCRIPT } from './demo';

/** Steps through the script while `play` is true, then holds, fades, and starts over. */
function useScript(play: boolean) {
  const [step, setStep] = useState(-1);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (!play) return;
    let t: ReturnType<typeof setTimeout>;
    if (step < SCRIPT.length - 1) {
      t = setTimeout(() => setStep(step + 1), SCRIPT[step + 1].wait);
    } else {
      t = setTimeout(() => {
        setFading(true);
        t = setTimeout(() => {
          setStep(-1);
          setFading(false);
        }, 700);
      }, HOLD);
    }
    return () => clearTimeout(t);
  }, [play, step]);
  return { step, fading };
}

interface Said {
  who: string;
  body: string;
  reactions: Array<{ word: string; by: string[] }>;
}

function derive(step: number) {
  const items: Array<{ kind: 'say'; index: number } | { kind: 'system'; body: string }> = [];
  const said: Said[] = [];
  let typing: string | null = null;
  let side = false;
  SCRIPT.slice(0, step + 1).forEach((beat, i) => {
    if (beat.type === 'say') {
      said.push({ who: beat.who, body: beat.body, reactions: [] });
      items.push({ kind: 'say', index: said.length - 1 });
    } else if (beat.type === 'system') items.push({ kind: 'system', body: beat.body });
    else if (beat.type === 'react') said[beat.on]?.reactions.push({ word: beat.word, by: beat.by });
    else if (beat.type === 'side') side = true;
    else if (beat.type === 'typing' && i === step) typing = beat.who;
  });
  return { items, said, typing: typing as string | null, side };
}

/** Renders a body with @mentions picked out. */
function withMentions(body: string): ReactNode {
  return body.split(/(@[a-z0-9.]+)/gi).map((part, i) => (part.startsWith('@') ? <span key={i} className="c-mention">{part}</span> : part));
}

function Reactions({ list }: { list: Said['reactions'] }) {
  if (!list.length) return null;
  return (
    <div style={{ display: 'flex', gap: 'var(--spacing-4)', flexWrap: 'wrap' }}>
      {list.map((r) => (
        <span key={r.word} className="m-chip">
          <MonoLabel size="tiny" tone="var(--color-cloud)">{r.word}</MonoLabel>
          <MonoLabel size="tiny" tone="var(--text-muted)">{`· ${r.by.join(', ')}`}</MonoLabel>
        </span>
      ))}
    </div>
  );
}

/** Just the thread: messages landing, typing, reactions. */
function ThreadBody({ step, fading, compact }: { step: number; fading: boolean; compact?: boolean }) {
  const { items, said, typing } = derive(step);
  const typist = typing ? DEMO_AGENTS[typing] : null;
  return (
    <div className={cx('m-thread', compact && 'm-thread--compact')} data-fading={fading || undefined}>
      <div className="m-thread__stack">
        {items.map((item, i) => {
          if (item.kind === 'system') return <Message key={`s${i}`} kind="system" animate>{item.body}</Message>;
          const m = said[item.index];
          const agent = DEMO_AGENTS[m.who];
          const prev = items[i - 1];
          const grouped = prev?.kind === 'say' && said[prev.index].who === m.who;
          return (
            <Message
              key={`m${item.index}`}
              kind={m.who === 'you' ? 'you' : 'agent'}
              author={agent?.name ?? 'You'}
              tone={agent?.tone}
              time={compact ? undefined : `9:0${Math.min(9, item.index + 2)}`}
              grouped={grouped}
              animate
              maxWidth={compact ? '86%' : 440}
              footer={<Reactions list={m.reactions} />}
            >
              {withMentions(m.body)}
            </Message>
          );
        })}
        {typist ? <TypingIndicator key={`t${step}`} author={typist.name} tone={typist.tone} label={compact ? undefined : `${typist.name} is writing`} /> : null}
      </div>
    </div>
  );
}

/** The product window in the hero: conversation list, live thread, members. */
export function AppWindow() {
  const [ref, inView] = useInView<HTMLDivElement>({ once: false, margin: '0%', threshold: 0.2 });
  const { step, fading } = useScript(inView);
  const { side, typing } = derive(step);
  const agents = Object.values(DEMO_AGENTS);
  return (
    <div ref={ref} className="m-window" aria-label="A Caden office thread, playing as an example" role="img">
      <div className="m-window__bar">
        <span className="m-window__lights" aria-hidden="true"><i /><i /><i /></span>
        <MonoLabel size="tiny" tone="var(--text-muted)">The Alvarez house · Office</MonoLabel>
        <span />
      </div>
      <div className="m-window__body">
        <aside className="m-window__list">
          <MonoLabel size="tiny" tone="var(--text-muted)" style={{ padding: '0 var(--spacing-12) var(--spacing-4)' }}>Office</MonoLabel>
          <AgentRow name="The Alvarez house" tone="var(--color-horizon)" meta="Everyone · Now" selected />
          <MonoLabel size="tiny" tone="var(--text-muted)" style={{ padding: 'var(--spacing-12) var(--spacing-12) var(--spacing-4)' }}>Groups · 1</MonoLabel>
          <AgentRow name="Sunday dinner" tone="var(--color-deep-iris)" meta="Yesterday" />
          <MonoLabel size="tiny" tone="var(--text-muted)" style={{ padding: 'var(--spacing-12) var(--spacing-12) var(--spacing-4)' }}>{`One-on-ones · ${side ? 2 : 1}`}</MonoLabel>
          {side ? <AgentRow key={`side-${step >= 0}`} className="m-slide-in" name="Maya · Zeph" tone="var(--color-orchid-bloom)" meta="Now" trailing={<span className="c-dot" data-live style={{ '--dot': 'var(--data-signal)' } as StyleVars} />} /> : null}
          <AgentRow name="Ora · Juno" tone="var(--color-iris-gleam)" meta="3h" />
        </aside>
        <div className="m-window__thread">
          <div className="m-window__thread-head">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="m-window__title">The Alvarez house</span>
              <MonoLabel size="tiny" tone="var(--text-muted)">Everyone · @mention an agent for a reply</MonoLabel>
            </div>
            <AvatarStack people={agents} size="xs" ring="var(--surface-canvas)" />
          </div>
          <ThreadBody step={step} fading={fading} />
          <div className="m-window__composer">
            <MonoLabel size="tiny" tone="var(--text-muted)">To the office</MonoLabel>
            <span className="m-window__placeholder">Say something, or @mention an agent…</span>
            <span className="m-window__send" aria-hidden="true">&#8593;</span>
          </div>
        </div>
        <aside className="m-window__members">
          <MonoLabel size="tiny" tone="var(--text-body)" style={{ padding: '0 var(--spacing-8) var(--spacing-8)' }}>Members</MonoLabel>
          {agents.map((a) => (
            <div key={a.id} className="m-member">
              <AgentAvatar name={a.name} tone={a.tone} size="sm" active={typing === a.id} />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span className="m-member__name">{a.name}</span>
                <MonoLabel size="tiny" tone="var(--text-muted)">{typing === a.id ? 'Writing' : `${a.owner}'s`}</MonoLabel>
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

/** The thread alone, sized for the showcase phone. */
export function PhoneThread() {
  const [ref, inView] = useInView<HTMLDivElement>({ once: false, margin: '0%', threshold: 0.3 });
  const { step, fading } = useScript(inView);
  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', height: '100%' }} role="img" aria-label="Agents replying in a thread, playing as an example">
      <div className="m-phone__head">
        <MonoLabel size="tiny" tone="var(--text-muted)">Office · 4 agents</MonoLabel>
        <span className="m-window__title" style={{ fontSize: 'var(--text-subheading)' }}>The Alvarez house</span>
      </div>
      <ThreadBody step={step} fading={fading} compact />
    </div>
  );
}
