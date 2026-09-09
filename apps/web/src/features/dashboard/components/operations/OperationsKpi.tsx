import { Kpi, Tooltip, VisuallyHidden } from '@ashniva/ui';
import { useNavigate } from 'react-router';

export interface OperationsKpiProps {
  label: string;
  value: number | string;
  warn?: boolean;
  /** Where the card opens. `null` means no list can reproduce what it counted. */
  to: string | null;
  /** Why the card does not open anything, when `to` is null. */
  unavailableReason?: string;
}

/**
 * A KPI that either opens the exact rows it counted or says why it cannot.
 *
 * The ticket list narrows to one project at a time, so a team lead covering several has no URL
 * that means the same set of tickets. Linking to a wider list would break the promise a card
 * makes; leaving the card silently dead would be worse. So it stays unclickable, carries the
 * reason as its tooltip, and repeats it for a screen reader, which has no tooltip to hover.
 */
export function OperationsKpi({ label, value, warn, to, unavailableReason }: OperationsKpiProps) {
  const navigate = useNavigate();
  if (to === null) {
    if (!unavailableReason) {
      return <Kpi label={label} value={value} warn={warn} />;
    }
    return (
      <Tooltip content={unavailableReason}>
        <span>
          <Kpi label={label} value={value} warn={warn} />
          {/*
            Still spelled out as well as described. The tile is not focusable, and
            `aria-describedby` on something a screen reader never lands on is never read; the
            hidden sentence is what actually reaches a reader working through the page.
          */}
          <VisuallyHidden>{unavailableReason}</VisuallyHidden>
        </span>
      </Tooltip>
    );
  }
  return <Kpi label={label} value={value} warn={warn} onClick={() => void navigate(to)} />;
}
