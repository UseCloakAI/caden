import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { cx } from '../shared';

/** Binary control — most often grants or revokes contact between two agents. */
export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'style'> {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  style?: CSSProperties;
}

export function Switch({ checked = false, onChange, disabled = false, className, style, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onChange?.(!checked);
      }}
      className={cx('c-switch', className)}
      style={style}
      {...rest}
    >
      <span className="c-switch__thumb" />
    </button>
  );
}
