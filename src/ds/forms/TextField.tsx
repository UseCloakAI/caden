import { useId, type CSSProperties, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { MonoLabel } from '../core/MonoLabel';

/** Single-line text input with a mono uppercase label. */
export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'style'> {
  /** Mono uppercase label above the field. */
  label?: string;
  /** Right side of the label row, e.g. a character count or a text link. */
  labelAside?: ReactNode;
  /** Quiet helper line below. */
  hint?: string;
  /** Replaces the hint and marks the field invalid. */
  error?: string | null;
  /** Inside the field, flush right — an icon button, a unit. */
  trailing?: ReactNode;
  value?: string;
  onChange?: (value: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  style?: CSSProperties;
}

export function TextField({ label, labelAside, hint, error, trailing, value, onChange, placeholder, type = 'text', inputRef, disabled, id, className, style, ...rest }: TextFieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const noteId = `${fieldId}-note`;
  return (
    <div className={className ? `c-field ${className}` : 'c-field'} style={style}>
      {label || labelAside ? (
        <div className="c-field__label-row">
          {label ? <MonoLabel size="tiny" tone="var(--text-body)"><label htmlFor={fieldId}>{label}</label></MonoLabel> : <span />}
          {labelAside}
        </div>
      ) : null}
      <div className="c-field__control" data-invalid={error ? true : undefined} data-disabled={disabled || undefined}>
        <input
          id={fieldId}
          ref={inputRef}
          className="c-field__input"
          type={type}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? noteId : undefined}
          onChange={(e) => onChange?.(e.target.value)}
          {...rest}
        />
        {trailing ? <div className="c-field__trailing">{trailing}</div> : null}
      </div>
      {error ? (
        <span id={noteId} className="c-field__error" role="alert">{error}</span>
      ) : hint ? (
        <span id={noteId} className="c-field__hint">{hint}</span>
      ) : null}
    </div>
  );
}
