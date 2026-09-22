import { useState, type CSSProperties, type InputHTMLAttributes } from 'react';
import { MonoLabel } from '../core/MonoLabel';

/** Single-line text input with a mono uppercase label. */
export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'style'> {
  /** Mono uppercase label above the field. */
  label?: string;
  /** Quiet helper line below. */
  hint?: string;
  value?: string;
  onChange?: (value: string) => void;
  style?: CSSProperties;
}

export function TextField({ label, hint, value, onChange, placeholder, type = 'text', style, ...rest }: TextFieldProps) {
  const [focus, setFocus] = useState(false);
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)', ...style }}>
      {label ? <MonoLabel size="tiny" tone="var(--text-body)">{label}</MonoLabel> : null}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
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
          outline: 'none',
          transition: 'var(--transition-state)',
        }}
        {...rest}
      />
      {hint ? <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>{hint}</span> : null}
    </label>
  );
}
