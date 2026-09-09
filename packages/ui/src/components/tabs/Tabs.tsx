import { useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';

import { nextKeyForArrowPress } from './roving-focus';

import './tabs.css';

export interface TabItem<TKey extends string = string> {
  key: TKey;
  label: ReactNode;
  count?: number;
  /** The id of the panel this tab controls, when the panel is rendered by the caller. */
  panelId?: string;
}

export interface TabsProps<TKey extends string = string> {
  items: TabItem<TKey>[];
  value: TKey;
  onChange: (key: TKey) => void;
  'aria-label': string;
}

/**
 * A hook shared by the two widgets below: one tab stop, arrow keys move, focus follows selection.
 *
 * The `refs` map exists because moving selection is not enough — after an arrow press the browser
 * leaves focus on the button that is now `tabindex="-1"`, which drops the keyboard out of the
 * widget entirely on the next press.
 */
function useRovingSelection<TKey extends string>(
  keys: readonly TKey[],
  value: TKey,
  onChange: (key: TKey) => void,
) {
  const refs = useRef(new Map<TKey, HTMLButtonElement | null>());

  /*
   * Which option holds the widget's single tab stop.
   *
   * Normally the selected one. When `value` names an option that is not on screen — the task list
   * hides two of its views from people who cannot assign, and a bookmarked URL can still ask for
   * one of them — falling back to the first option is what stops the whole widget from becoming
   * unreachable by keyboard, which is what a set of all-`-1` tab indexes would be.
   */
  const tabStop = keys.includes(value) ? value : keys[0];

  function onKeyDown(event: ReactKeyboardEvent) {
    const next = nextKeyForArrowPress(event, keys, value);
    if (next === null) {
      return;
    }
    event.preventDefault();
    onChange(next);
    refs.current.get(next)?.focus();
  }

  function register(key: TKey) {
    return (element: HTMLButtonElement | null) => {
      refs.current.set(key, element);
    };
  }

  return { onKeyDown, register, tabStop };
}

/** Underlined tab strip used for page sections (Overview / Tasks / Tickets …). */
export function Tabs<TKey extends string>({ items, value, onChange, ...rest }: TabsProps<TKey>) {
  const { onKeyDown, register, tabStop } = useRovingSelection(
    items.map((item) => item.key),
    value,
    onChange,
  );
  return (
    /*
     * jsx-a11y wants the container focusable. It is not, and must not be: this is a roving
     * tabindex, where exactly one *option* holds the tab stop and the container holds none.
     * That is the pattern the tablist and radiogroup roles describe; the rule cannot see it.
     */
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus
    <div className="ui-tabs" role="tablist" aria-label={rest['aria-label']} onKeyDown={onKeyDown}>
      {items.map((item) => {
        const selected = item.key === value;
        return (
          <button
            key={item.key}
            ref={register(item.key)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={item.panelId}
            tabIndex={item.key === tabStop ? 0 : -1}
            className={['ui-tabs__tab', selected ? 'ui-tabs__tab--selected' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(item.key)}
          >
            {item.label}
            {item.count !== undefined ? <span className="ui-tabs__count">{item.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export interface SegmentedOption<TKey extends string = string> {
  key: TKey;
  label: ReactNode;
  count?: number;
}

export interface SegmentedControlProps<TKey extends string = string> {
  options: SegmentedOption<TKey>[];
  value: TKey;
  onChange: (key: TKey) => void;
  'aria-label': string;
  size?: 'sm' | 'md';
}

/** Pill-style single choice (view chips, priority pickers, board / list toggle). */
export function SegmentedControl<TKey extends string>({
  options,
  value,
  onChange,
  size = 'md',
  ...rest
}: SegmentedControlProps<TKey>) {
  const { onKeyDown, register, tabStop } = useRovingSelection(
    options.map((option) => option.key),
    value,
    onChange,
  );
  return (
    // Roving tabindex again — see the note in `Tabs` above.
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus
    <div
      className={`ui-segmented ui-segmented--${size}`}
      role="radiogroup"
      aria-label={rest['aria-label']}
      onKeyDown={onKeyDown}
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <button
            key={option.key}
            ref={register(option.key)}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={option.key === tabStop ? 0 : -1}
            className={['ui-segmented__option', selected ? 'ui-segmented__option--selected' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(option.key)}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="ui-segmented__count">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
