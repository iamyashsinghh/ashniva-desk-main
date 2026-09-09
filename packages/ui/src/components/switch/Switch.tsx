import { useId, type ReactNode } from 'react';

import './switch.css';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  /** Shown under the label, e.g. "The client will read this". */
  description?: ReactNode;
  disabled?: boolean;
  /** Green when on — used for the client-visible toggle so it matches the badge colour. */
  tone?: 'brand' | 'success';
}

/** Toggle with an always-visible label; used for "Client-visible" and settings switches. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  tone = 'brand',
}: SwitchProps) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className="ui-switch">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descriptionId}
        disabled={disabled}
        className={`ui-switch__track ui-switch__track--${tone}`}
        onClick={() => onChange(!checked)}
      >
        <span className="ui-switch__thumb" aria-hidden="true" />
      </button>
      <div className="ui-switch__text">
        <label htmlFor={id} className="ui-switch__label">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="ui-switch__description">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
