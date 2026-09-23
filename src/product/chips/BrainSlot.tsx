import { useState, type DragEvent } from 'react';
import { Button, MonoLabel } from '@/ds';
import { CHIP_DRAG_TYPE, chipTag, useChips } from '@/lib/chips';
import { navigate } from '@/lib/router';
import type { Agent } from '@/lib/types';
import { Chip } from './Chip';

const since = (iso: string) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return min < 1 ? 'just now' : min < 60 ? `${min}m ago` : `${Math.round(min / 60)}h ago`;
};

/**
 * The agent's brain socket plus your chip library. Drag a chip into the socket (or tap it) to
 * swap the model. Empty socket = the default brain. `onSlot` persists the choice.
 */
export function BrainSlot({ chipId, onSlot, agent, readOnly = false }: { chipId: string | null; onSlot?: (id: string | null) => void | Promise<void>; agent?: Agent; readOnly?: boolean }) {
  const { chips, library, fallback, has } = useChips();
  const [over, setOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const slotted = chips.find((c) => c.id === chipId);
  const current = slotted ?? fallback;
  const alarm = agent?.model_error_at ? agent.model_error : null;
  const backup = !alarm && agent?.last_model && current && agent.last_model !== current.model
    ? chips.find((c) => c.model === agent.last_model)?.name ?? (agent.last_model.startsWith('claude') ? 'Claude' : agent.last_model)
    : null;

  const slot = async (id: string | null) => {
    if (readOnly || !onSlot || id === chipId) return;
    setSaving(true);
    await onSlot(id);
    setSaving(false);
  };

  const accepts = (e: DragEvent) => !readOnly && e.dataTransfer.types.includes(CHIP_DRAG_TYPE);

  return (
    <div className="p-brain">
      <div className="p-brain__row">
        <div
          className="p-socket"
          data-over={over || undefined}
          data-alarm={alarm ? true : undefined}
          aria-label={readOnly ? 'Brain' : 'Brain slot. Drag a chip here.'}
          onDragOver={(e) => {
            if (!accepts(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            setOver(false);
            if (!accepts(e)) return;
            e.preventDefault();
            const id = e.dataTransfer.getData(CHIP_DRAG_TYPE);
            const chip = chips.find((c) => c.id === id);
            if (chip && has(chip)) slot(chip.is_default ? null : chip.id);
          }}
        >
          {alarm ? <span className="c-alarm p-socket__light" role="img" aria-label="Brain error" /> : null}
          {current ? (
            <span key={current.id} className="p-socket__seat">
              <Chip chip={current} size="lg" />
            </span>
          ) : null}
        </div>
        <div className="p-brain__info">
          <MonoLabel size="micro" tone="var(--color-cloud)">{slotted ? 'Brain' : 'Default brain'}</MonoLabel>
          <span className="p-brain__name">{current?.name ?? '…'}</span>
          {current ? <MonoLabel size="tiny" tone="var(--text-muted)">{chipTag(current)}</MonoLabel> : null}
          {current && !current.live ? <MonoLabel size="tiny" tone="var(--color-alarm)">Offline on Groq · running on the default</MonoLabel> : null}
          {backup ? <MonoLabel size="tiny" tone="var(--text-muted)">{`Last reply ran on backup: ${backup}`}</MonoLabel> : null}
          {slotted && !readOnly ? (
            <Button variant="text" size="sm" icon="x" loading={saving} onClick={() => slot(null)} style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>Eject</Button>
          ) : null}
        </div>
      </div>

      {alarm && agent?.model_error_at ? (
        <div className="p-brain__alarm" role="alert">
          <span className="c-alarm" aria-hidden="true" />
          <span>{`Every brain failed ${since(agent.model_error_at)}, Claude included. ${alarm} The light clears on the next turn that works.`}</span>
        </div>
      ) : null}

      {readOnly ? null : (
        <>
          <MonoLabel size="tiny" tone="var(--text-muted)">Your chips · drag one into the slot, or tap it</MonoLabel>
          <div className="p-tray">
            {library.map((c) => (
              <div key={c.id} className="p-tray__item" data-current={c.id === current?.id || undefined}>
                <Chip chip={c} size="sm" draggable={c.live} onClick={c.live ? () => slot(c.is_default ? null : c.id) : undefined} label={`Slot ${c.name}`} />
                <span className="p-tray__label">{c.name}</span>
              </div>
            ))}
            <div className="p-tray__item">
              <Button variant="ghost" size="sm" icon="plus" onClick={() => navigate('/app/store')} aria-label="Get more chips" />
              <span className="p-tray__label">Store</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
