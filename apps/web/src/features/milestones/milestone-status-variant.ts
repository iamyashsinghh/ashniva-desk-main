import { MILESTONE_STATUS, type MilestoneStatus } from '@ashniva/types';
import type { ButtonVariant } from '@ashniva/ui';

const STATUS_VARIANTS: Partial<Record<MilestoneStatus, ButtonVariant>> = {
  [MILESTONE_STATUS.COMPLETED]: 'accent',
  [MILESTONE_STATUS.CANCELLED]: 'ghost',
};

/** Button colour for a milestone transition: finishing is accent, cancelling is quiet. */
export function statusVariant(status: MilestoneStatus): ButtonVariant {
  return STATUS_VARIANTS[status] ?? 'primary';
}
