import { VISIBILITY, type Visibility } from '@ashniva/types';

import { Badge } from './Badge';

export interface VisibilityBadgeProps {
  visibility: Visibility;
}

/**
 * The green CLIENT-VISIBLE / grey INTERNAL badge that appears on every comment, update, file
 * and estimate. Internal vs client-visible must be unmistakable everywhere.
 */
export function VisibilityBadge({ visibility }: VisibilityBadgeProps) {
  if (visibility === VISIBILITY.CLIENT) {
    return <Badge tone="success">Client-visible</Badge>;
  }
  return <Badge tone="neutral">Internal</Badge>;
}
