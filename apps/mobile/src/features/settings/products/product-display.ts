import type { ProductSummary } from '@ashniva/types';

import type { PillTone } from '../../../shared/components/primitives';

export interface StatePill {
  label: string;
  tone: PillTone;
}

/**
 * The switches somebody opens the registry to check, as pills — the same four badges the web's
 * State column shows, plus the two warnings that mean the product cannot raise a ticket at all.
 */
export function productPills(product: ProductSummary): StatePill[] {
  const pills: StatePill[] = [];
  if (!product.isActive) {
    pills.push({ label: 'Inactive', tone: 'neutral' });
  }
  pills.push(
    product.supportEnabled
      ? { label: 'Support on', tone: 'success' }
      : { label: 'Support off', tone: 'warning' },
  );
  if (!product.autoRouteEnabled) {
    pills.push({ label: 'Manual routing', tone: 'neutral' });
  }
  if (product.ivrEnabled) {
    pills.push({ label: 'IVR', tone: 'info' });
  }
  if (!product.project) {
    pills.push({ label: 'Not linked', tone: 'warning' });
  }
  if (product.activeCredentials === 0) {
    pills.push({ label: 'No keys', tone: 'warning' });
  }
  return pills;
}

export type ProductFilter = 'all' | 'active' | 'support-off' | 'needs-setup';

export const PRODUCT_FILTERS: { value: ProductFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'support-off', label: 'Support off' },
  { value: 'needs-setup', label: 'Needs setup' },
];

export function matchesProduct(product: ProductSummary, term: string, filter: ProductFilter) {
  if (filter === 'active' && !product.isActive) {
    return false;
  }
  if (filter === 'support-off' && product.supportEnabled) {
    return false;
  }
  // Either gap on its own means the ingress refuses every request from this product.
  if (filter === 'needs-setup' && product.project && product.activeCredentials > 0) {
    return false;
  }
  if (!term) {
    return true;
  }
  return [product.name, product.code, product.project?.code, product.project?.name]
    .filter(Boolean)
    .some((text) => text?.toLowerCase().includes(term));
}

export function splitList(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function when(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : '—';
}
