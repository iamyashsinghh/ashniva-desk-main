import { PERMISSIONS, type ProductDetail } from '@ashniva/types';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { Chip, ChipScroller } from '../../../shared/components/chips';
import { SearchFilterBar } from '../../../shared/components/FilterSheet';
import { StickyActionBar } from '../../../shared/components/layout';
import { AppText, Button, Screen } from '../../../shared/components/primitives';
import { PullRefresh } from '../../../shared/components/PullRefresh';
import { QueryState } from '../../../shared/components/states';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';
import { NoAccess } from '../shared/SettingsLayout';
import { useProducts } from './api';
import { NewProductSheet } from './NewProductSheet';
import { ProductCard } from './ProductCard';
import { matchesProduct, PRODUCT_FILTERS, type ProductFilter } from './product-display';

/**
 * Admin → Products: every application allowed to raise tickets into Desk without a human login.
 *
 * The switches are on each card, as they are in the web's table, because whether a product is
 * live, accepting support and routed is what somebody comes here to check. "Needs setup" gathers
 * the products the ingress will refuse outright — no support project, or no live key.
 */
export function ProductsScreen({ onOpen }: { onOpen: (productId: string) => void }) {
  const theme = useTheme();
  const { can } = useSession();
  const canRead = can(PERMISSIONS.PRODUCT_READ);
  const canManage = can(PERMISSIONS.PRODUCT_MANAGE);
  const products = useProducts(canRead);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ProductFilter>('all');
  const [creating, setCreating] = useState(false);

  const visible = useMemo(
    () =>
      (products.data ?? []).filter((product) =>
        matchesProduct(product, search.trim().toLowerCase(), filter),
      ),
    [products.data, search, filter],
  );

  if (!canRead) {
    return <NoAccess description="The product registry needs the product permission." />;
  }

  const filtered = Boolean(search.trim()) || filter !== 'all';

  return (
    <Screen>
      <FlatList
        data={visible}
        keyExtractor={(product) => product.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <PullRefresh busy={products.isRefetching} onRefresh={() => products.refetch()} />
        }
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.sm }}>
            <AppText size="sm" tone="muted">
              Applications that raise support tickets into Desk without a human login.
            </AppText>
            <SearchFilterBar search={search} onSearch={setSearch} placeholder="Search products" />
            <ChipScroller>
              {PRODUCT_FILTERS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={filter === option.value}
                  onPress={() => setFilter(option.value)}
                />
              ))}
            </ChipScroller>
          </View>
        }
        ListEmptyComponent={
          <QueryState
            isLoading={products.isLoading}
            error={products.error}
            onRetry={() => void products.refetch()}
            isEmpty
            emptyIcon="cube-outline"
            emptyTitle={filtered ? 'No products match' : 'No products yet'}
            emptyDescription={
              filtered
                ? 'Try another search or filter.'
                : 'Register one to give an application its own support credentials.'
            }
          >
            {null}
          </QueryState>
        }
        renderItem={({ item }) => <ProductCard product={item} onOpen={() => onOpen(item.id)} />}
      />
      {canManage ? (
        <StickyActionBar>
          <Button
            label="Register a product"
            icon="add"
            onPress={() => setCreating(true)}
            style={{ flex: 1 }}
          />
        </StickyActionBar>
      ) : null}
      {creating ? (
        <NewProductSheet
          onClose={() => setCreating(false)}
          onCreated={(product: ProductDetail) => {
            setCreating(false);
            onOpen(product.id);
          }}
        />
      ) : null}
    </Screen>
  );
}
