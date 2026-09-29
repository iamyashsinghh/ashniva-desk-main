import {
  PRIORITY_LABELS,
  SUPPORT_TIER_LABELS,
  TICKET_TYPE_LABELS,
  type ProductDetail,
} from '@ashniva/types';

import { KeyValueRow } from '../../../shared/components/data-display';
import { Section } from '../../../shared/components/layout';
import { Button } from '../../../shared/components/primitives';

/** The product's settings as they stand, with Edit for somebody who may change them. */
export function ProductSettingsSection({
  product,
  onEdit,
}: {
  product: ProductDetail;
  onEdit?: () => void;
}) {
  return (
    <Section
      title="Support settings"
      icon="settings-outline"
      {...(onEdit
        ? {
            action: (
              <Button
                label="Edit"
                icon="create-outline"
                size="sm"
                variant="ghost"
                accessibilityHint="Edits the product's support settings"
                onPress={onEdit}
              />
            ),
          }
        : {})}
    >
      <KeyValueRow
        label="Support project"
        value={product.project ? `${product.project.code} · ${product.project.name}` : 'Not linked'}
        {...(product.project ? {} : { tone: 'danger' as const })}
      />
      <KeyValueRow label="Support tier" value={SUPPORT_TIER_LABELS[product.supportTier]} />
      <KeyValueRow label="Default priority" value={PRIORITY_LABELS[product.defaultPriority]} />
      <KeyValueRow label="Default type" value={TICKET_TYPE_LABELS[product.defaultType]} />
      <KeyValueRow
        label="Work areas"
        value={product.allowedWorkAreas.length ? product.allowedWorkAreas.join(', ') : 'Any'}
      />
      <KeyValueRow
        label="Widget origins"
        value={
          product.allowedOrigins.length ? product.allowedOrigins.join(', ') : 'No embedded widget'
        }
      />
      <KeyValueRow label="Requester identity" value={product.supportRequester?.name ?? '—'} />
    </Section>
  );
}
