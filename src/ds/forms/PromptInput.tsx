import { useImperativeHandle, useLayoutEffect, useRef, type CSSProperties, type FormHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { Icon } from '../core/Icon';
import { cx } from '../shared';

/** Natural-language composer. Void field, circular send that turns white once there is something to send. */
export interface PromptInputProps extends Omit<FormHTMLAttributes<HTMLFormElement>, 'onChange' | 'onSubmit'> {
  /** @default "Ask anything…" */
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  /** Mono prefix naming who is being addressed, e.g. "To Maya's agent". */
  addressing?: string;
  /** Grows with its content up to ~8 lines. Enter sends, Shift+Enter breaks the line. @default false */
  multiline?: boolean;
  /** Runs before the built-in key handling; call preventDefault to take the key. */
  onInputKeyDown?: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  /** Called with the caret position whenever it moves. */
  onCaret?: (caret: number) => void;
  inputRef?: Ref<HTMLInputElement | HTMLTextAreaElement>;
  /** Floats above the field — mention suggestions and the like. */
  popover?: ReactNode;
  autoFocus?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
}

export function PromptInput({ placeholder = 'Ask anything…', value, onChange, onSubmit, addressing, multiline = false, onInputKeyDown, onCaret, inputRef, popover, autoFocus, disabled, className, style, ...rest }: PromptInputProps) {
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const ready = !!value?.trim();
  useImperativeHandle(inputRef, () => fieldRef.current!, []);

  // Auto-grow: reset to one line, then fit the content.
  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!multiline || !el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value, multiline]);

  const shared = {
    ref: fieldRef,
    className: 'c-prompt__input',
    value,
    placeholder,
    autoFocus,
    disabled,
    'aria-label': placeholder,
    onChange: (e: { target: { value: string; selectionStart: number | null } }) => {
      onChange?.(e.target.value);
      onCaret?.(e.target.selectionStart ?? e.target.value.length);
    },
    onSelect: (e: { currentTarget: { selectionStart: number | null } }) => onCaret?.(e.currentTarget.selectionStart ?? 0),
    onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onInputKeyDown?.(e);
      if (e.defaultPrevented) return;
      if (multiline && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        if (ready) onSubmit?.(value ?? '');
      }
    },
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(value ?? '');
      }}
      className={cx('c-prompt', className)}
      style={style}
      {...rest}
    >
      {popover ? <div className="c-prompt__popover">{popover}</div> : null}
      {addressing ? <span className="c-prompt__addressing">{addressing}</span> : null}
      {multiline ? <textarea rows={1} {...shared} /> : <input {...shared} />}
      <button type="submit" aria-label="Send" className="c-prompt__send" data-ready={ready || undefined} disabled={disabled}>
        <Icon name="arrow-up" size={16} tone="current" style={{ color: ready ? 'var(--color-void)' : 'var(--color-pure)' }} />
      </button>
    </form>
  );
}
