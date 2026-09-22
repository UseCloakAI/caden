import type { ButtonHTMLAttributes, CSSProperties } from 'react';

/** Binary control — most often grants or revokes contact between two agents. */
export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'style'> {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  style?: CSSProperties;
}

export function Switch({ checked = false, onChange, disabled = false, style, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      style={{
        width: 44,
        height: 26,
        flex: 'none',
        borderRadius: 'var(--radius-pill)',
        border: checked ? '1px solid transparent' : '1px solid rgba(255,255,255,0.2)',
        background: checked ? 'var(--color-pure)' : 'var(--surface-glass)',
        padding: 3,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'var(--transition-state)',
        display: 'flex',
        justifyContent: checked ? 'flex-end' : 'flex-start',
        alignItems: 'center',
        ...style,
      }}
      {...rest}
    >
      <span style={{ width: 18, height: 18, borderRadius: 'var(--radius-pill)', background: checked ? 'var(--color-void)' : 'var(--color-ash)', display: 'block' }} />
    </button>
  );
}
