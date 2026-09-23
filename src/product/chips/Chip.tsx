import { useState, type DragEvent } from 'react';
import { cx, type StyleVars } from '@/ds';
import { CHIP_DRAG_TYPE, chipMark, chipTag } from '@/lib/chips';
import type { ModelChip } from '@/lib/types';
import './chips.css';

/** One brain, drawn as a processor. Draggable into an agent's brain slot when `draggable`. */
export function Chip({ chip, size = 'md', draggable = false, onClick, label }: { chip: ModelChip; size?: 'sm' | 'md' | 'lg'; draggable?: boolean; onClick?: () => void; label?: string }) {
  const [dragging, setDragging] = useState(false);
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={cx('p-chip', size !== 'md' && `p-chip--${size}`)}
      style={{ '--chip': chip.tone } as StyleVars}
      draggable={draggable || undefined}
      data-offline={!chip.live || undefined}
      data-dragging={dragging || undefined}
      aria-label={label ?? `${chip.name} (${chipTag(chip)})`}
      title={`${chip.name} · ${chipTag(chip)}`}
      onClick={onClick}
      onDragStart={(e: DragEvent) => {
        e.dataTransfer.setData(CHIP_DRAG_TYPE, chip.id);
        e.dataTransfer.setData('text/plain', chip.id);
        e.dataTransfer.effectAllowed = 'copy';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
    >
      <span className="p-chip__die">
        <span className="p-chip__mark">{chipMark(chip.name)}</span>
      </span>
    </Tag>
  );
}

/** 1–5 filled bars in the chip's colour. */
export function Pips({ value }: { value: number }) {
  return (
    <span className="p-pips" role="meter" aria-valuemin={1} aria-valuemax={5} aria-valuenow={value}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} data-on={n <= value || undefined} />
      ))}
    </span>
  );
}
