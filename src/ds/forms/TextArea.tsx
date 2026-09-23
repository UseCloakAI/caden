import { useId, type CSSProperties, type TextareaHTMLAttributes } from 'react';
import { MonoLabel } from '../core/MonoLabel';

/** Multi-line companion to TextField — personas, routine instructions. */
export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'style'> {
  label?: string;
  hint?: string;
  error?: string | null;
  value?: string;
  onChange?: (value: string) => void;
  /** Show "used / max" beside the label when maxLength is set. @default true */
  counter?: boolean;
  /** @default 4 */
  rows?: number;
  style?: CSSProperties;
}

export function TextArea({ label, hint, error, value, onChange, rows = 4, counter = true, maxLength, id, className, style, ...rest }: TextAreaProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const noteId = `${fieldId}-note`;
  const count = value?.length ?? 0;
  return (
    <div className={className ? `c-field ${className}` : 'c-field'} style={style}>
      {label ? (
        <div className="c-field__label-row">
          <MonoLabel size="tiny" tone="var(--text-body)"><label htmlFor={fieldId}>{label}</label></MonoLabel>
          {counter && maxLength ? (
            <MonoLabel size="tiny" tone={count > maxLength * 0.9 ? 'var(--color-cloud)' : 'var(--text-muted)'} style={{ fontVariantNumeric: 'tabular-nums' }}>{`${count} / ${maxLength}`}</MonoLabel>
          ) : null}
        </div>
      ) : null}
      <div className="c-field__control" data-invalid={error ? true : undefined}>
        <textarea
          id={fieldId}
          className="c-field__input"
          value={value}
          rows={rows}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? noteId : undefined}
          onChange={(e) => onChange?.(e.target.value)}
          style={{ lineHeight: 'var(--leading-body-md)' }}
          {...rest}
        />
      </div>
      {error ? (
        <span id={noteId} className="c-field__error" role="alert">{error}</span>
      ) : hint ? (
        <span id={noteId} className="c-field__hint">{hint}</span>
      ) : null}
    </div>
  );
}
