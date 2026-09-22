import type { CSSProperties, FormHTMLAttributes } from 'react';
import { Icon } from '../core/Icon';
import { useHover } from '../shared';

/** Natural-language composer. Void field, 22px left padding, circular white-20% submit. */
export interface PromptInputProps extends Omit<FormHTMLAttributes<HTMLFormElement>, 'onChange' | 'onSubmit'> {
  /** @default "Ask anything…" */
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  /** Mono prefix naming who is being addressed, e.g. "To Maya's agent". */
  addressing?: string;
  style?: CSSProperties;
}

export function PromptInput({ placeholder = 'Ask anything…', value, onChange, onSubmit, addressing, style, ...rest }: PromptInputProps) {
  const { hover, bind } = useHover();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(value ?? '');
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-12)',
        background: 'var(--color-void)',
        border: 'var(--border-hairline)',
        borderRadius: 'var(--radius-inputs)',
        padding: '8px 8px 8px 22px',
        ...style,
      }}
      {...rest}
    >
      {addressing ? (
        <span style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontSize: 'var(--text-mono-tiny)', letterSpacing: 'var(--tracking-mono-tiny)', color: 'var(--text-muted)', flex: 'none' }}>
          {addressing}
        </span>
      ) : null}
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--color-cloud)',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-body-md)',
          lineHeight: 1.5,
          padding: '6px 0',
        }}
      />
      <button
        type="submit"
        aria-label="Send"
        {...bind}
        style={{
          width: 34,
          height: 34,
          flex: 'none',
          borderRadius: 'var(--radius-pill)',
          border: 'none',
          background: hover ? 'rgba(255,255,255,0.32)' : 'var(--surface-glass-strong)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          transition: 'var(--transition-state)',
        }}
      >
        <Icon name="arrow-up" size={16} />
      </button>
    </form>
  );
}
