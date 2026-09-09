import './meter.css';

export interface MeterProps {
  /** 0–100. Values outside the range are clamped rather than drawn off the end of the track. */
  percent: number;
  /** Names what is being measured, e.g. "Milestone progress". Required: a bare bar says nothing. */
  label: string;
  /** Red fill: over capacity, overdue, breaching. */
  warn?: boolean;
  /** Shows the number beside the bar. */
  showValue?: boolean;
  /** Extra text a sighted reader gets instead of the raw percentage, e.g. "6 of 8 tasks". */
  valueText?: string;
  size?: 'sm' | 'md';
}

/**
 * A horizontal progress bar.
 *
 * The same eight lines of markup existed as `.workload__bar` in the dashboard stylesheet and
 * again as a `ProgressBar` in the milestones feature, which reached across features to borrow
 * the dashboard's classes. Both were `aria-hidden` with the number in a sibling `<strong>`, so
 * the bar was invisible to assistive technology and the number arrived with no context.
 */
export function Meter({
  percent,
  label,
  warn = false,
  showValue = true,
  valueText,
  size = 'md',
}: MeterProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <span className={`ui-meter ui-meter--${size}`}>
      <span
        className="ui-meter__track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={valueText}
      >
        <span
          className={['ui-meter__fill', warn ? 'ui-meter__fill--warn' : '']
            .filter(Boolean)
            .join(' ')}
          style={{ inlineSize: `${clamped}%` }}
        />
      </span>
      {showValue ? (
        <span className="ui-meter__value" aria-hidden="true">
          {clamped}%
        </span>
      ) : null}
    </span>
  );
}
