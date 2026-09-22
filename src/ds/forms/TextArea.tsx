import { useState, type CSSProperties, type TextareaHTMLAttributes } from 'react';
import { MonoLabel } from '../core/MonoLabel';

/** Multi-line companion to TextField — personas, routine instructions. */
export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'style'> {
  label?: string;
  hint?: string;
  value?: string;
  onChange?: (value: string) => void;
  /** @default 4 */
  rows?: number;
  style?: CSSProperties;
}

export function TextArea({ label, hint, value, onChange, rows = 4, style, ...rest }: TextAreaProps) {
  const [focus, setFocus] = useState(false);
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)', ...style }}>
      {label ? <MonoLabel size="tiny" tone="var(--text-body)">{label}</MonoLabel> : null}
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          background: 'var(--color-void)',
          border: focus ? 'var(--border-solid)' : 'var(--border-hairline)',
          borderRadius: 'var(--radius-inputs)',
          padding: '12px 14px',
          color: 'var(--color-cloud)',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-body-md)',
          lineHeight: 'var(--leading-body-md)',
          outline: 'none',
          resize: 'vertical',
          transition: 'var(--transition-state)',
        }}
        {...rest}
      />
      {hint ? <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>{hint}</span> : null}
    </label>
  );
}
