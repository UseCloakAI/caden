import { useRef, type CSSProperties } from 'react';
import { useIndicator } from '../shared';

/** One-of-many picker with a sliding selection. For schedules, filters and small view switches. */
export interface SegmentedControlProps<T extends string> {
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  label?: string;
  style?: CSSProperties;
}

export function SegmentedControl<T extends string>({ options, value, onChange, label, style }: SegmentedControlProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const box = useIndicator(ref, value);
  return (
    <div ref={ref} className="c-seg" role="group" aria-label={label} style={style}>
      <span
        className="c-seg__indicator"
        aria-hidden="true"
        style={{ width: box.size, transform: `translate3d(${box.offset}px,0,0)`, opacity: box.size ? 1 : 0, transition: box.ready ? undefined : 'none' }}
      />
      {options.map((o) => (
        <button key={o.id} type="button" data-key={o.id} className="c-seg__item" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
