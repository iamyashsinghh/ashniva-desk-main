import type { ProductSummary } from '@ashniva/types';
import { View } from 'react-native';

import { MetaLine } from '../../../shared/components/data-display';
import { PressableCard } from '../../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../../shared/components/primitives';
import { productPills } from './product-display';

/** One registered product: its code, whose team answers for it, and whether it can raise tickets. */
export function ProductCard({ product, onOpen }: { product: ProductSummary; onOpen: () => void }) {
  return (
    <PressableCard
      icon="cube-outline"
      iconTone={product.isActive ? 'primary' : 'neutral'}
      onPress={onOpen}
      accessibilityLabel={`${product.name}, ${product.code}`}
      accessibilityHint="Opens the product"
    >
      <View style={{ gap: 4 }}>
        <AppText weight="bold" numberOfLines={1}>
          {product.name}
        </AppText>
        <AppText size="xs" tone="muted" tabular>
          {product.code}
        </AppText>
      </View>
      <PillRow>
        {productPills(product).map((pill) => (
          <Pill key={pill.label} label={pill.label} tone={pill.tone} />
        ))}
      </PillRow>
      <MetaLine icon="folder-open-outline">
        {product.project
          ? `${product.project.code} · ${product.project.name}`
          : 'No support project'}
      </MetaLine>
      <MetaLine icon="key-outline">
        {product.activeCredentials === 0
          ? 'No active keys'
          : `${product.activeCredentials} active key${product.activeCredentials === 1 ? '' : 's'}`}
        {` · ${product.openTickets} open ticket${product.openTickets === 1 ? '' : 's'}`}
      </MetaLine>
    </PressableCard>
  );
}
