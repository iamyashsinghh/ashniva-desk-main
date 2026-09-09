import type { CheckStatus } from '@ashniva/types';
import { StatusPill } from '@ashniva/ui';

import { CHECK_STATUS_LABELS, CHECK_STATUS_TONES } from '../qa-labels';

/**
 * The automated checks carried over from the pull request.
 *
 * Shown because "the build is red" is the cheapest reason not to start testing, and a tester who
 * only learns it after an hour on staging has lost the hour. It is information, not a gate: the
 * API decides what may be recorded.
 */
export function BuildStatus({ status }: { status: CheckStatus | null }) {
  if (!status) {
    return <span className="muted">No automated checks reported</span>;
  }
  return <StatusPill tone={CHECK_STATUS_TONES[status]} label={CHECK_STATUS_LABELS[status]} />;
}
