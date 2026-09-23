import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AgentAvatar, MonoLabel, PromptInput } from '@/ds';
import type { Agent } from '@/lib/types';

/** The `@partial` right before the caret, if the caret sits at the end of one. */
function mentionAt(text: string, caret: number) {
  const before = text.slice(0, caret);
  const m = before.match(/(^|\s)@([a-z0-9._]*)$/i);
  return m ? { query: m[2].toLowerCase(), start: caret - m[2].length - 1 } : null;
}

/** Thread composer: grows with its text, Enter sends, and `@` offers the office's agents. */
export function Composer({ agents, addressing, value, onChange, onSend, disabled }: { agents: Agent[]; addressing: string; value: string; onChange: (v: string) => void; onSend: () => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState(0);
  const [pick, setPick] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);

  const mention = mentionAt(value, caret);
  const matches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query;
    return agents
      .filter((a) => !q || a.handle.startsWith(q) || a.name.toLowerCase().startsWith(q))
      .slice(0, 6);
  }, [agents, mention]);
  const open = !!mention && matches.length > 0 && dismissed !== mention.start;
  const index = Math.min(pick, matches.length - 1);

  const insert = (a: Agent) => {
    if (!mention) return;
    const handle = `@${a.handle} `;
    const next = value.slice(0, mention.start) + handle + value.slice(caret);
    const at = mention.start + handle.length;
    onChange(next);
    setCaret(at);
    setPick(0);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(at, at);
    });
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setPick((index + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insert(matches[index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDismissed(mention!.start);
    }
  };

  return (
    <PromptInput
      multiline
      addressing={addressing}
      value={value}
      onChange={(v) => {
        onChange(v);
        setPick(0);
      }}
      onCaret={setCaret}
      onSubmit={onSend}
      onInputKeyDown={onKey}
      inputRef={input}
      disabled={disabled}
      placeholder="Say something, or @mention an agent…"
      popover={
        open ? (
          <div className="c-popover p-mentions" role="listbox" aria-label="Mention an agent">
            <MonoLabel size="tiny" tone="var(--text-muted)" style={{ padding: 'var(--spacing-8) var(--spacing-12) var(--spacing-4)' }}>Mention</MonoLabel>
            {matches.map((a, i) => (
              <button
                key={a.id}
                type="button"
                role="option"
                aria-selected={i === index}
                className="p-mention"
                onMouseEnter={() => setPick(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insert(a);
                }}
              >
                <AgentAvatar name={a.name} tone={a.tone} size="xs" />
                <span className="p-mention__name">{a.name}</span>
                <MonoLabel size="tiny" tone="var(--text-muted)">{`@${a.handle}`}</MonoLabel>
                {a.status === 'Paused' ? <MonoLabel size="tiny" tone="var(--text-muted)" style={{ marginLeft: 'auto' }}>Paused</MonoLabel> : null}
              </button>
            ))}
          </div>
        ) : null
      }
    />
  );
}
