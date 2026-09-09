/**
 * The supplier details a PDF prints, and the small formatting helpers that go with them.
 *
 * `Supplier` is deliberately its own shape rather than the billing profile row: an issued invoice
 * prints from a frozen snapshot, and the snapshot is this shape, not a database record.
 */
import type { BillingRepository } from './billing.repository';

export interface Supplier {
  legalName: string;
  address: string | null;
  stateCode: string | null;
  gstin: string | null;
  pan: string | null;
  email: string | null;
  phone: string | null;
  bankDetails: string | null;
  terms: string | null;
}

/** The shape `Invoice.snapshot` holds. Read defensively: it is JSON written by an older build. */
export interface SnapshotShape {
  supplier?: Supplier | null;
  customer?: {
    name?: string;
    address?: string | null;
    gstin?: string | null;
    stateCode?: string | null;
  } | null;
}

export function profileAsSupplier(
  profile: Awaited<ReturnType<BillingRepository['findProfile']>>,
): Supplier {
  return {
    legalName: profile?.legalName ?? 'Tax Invoice',
    address: profile
      ? [
          profile.addressLine1,
          profile.addressLine2,
          profile.city,
          profile.state,
          profile.postalCode,
        ]
          .filter(Boolean)
          .join(', ')
      : null,
    stateCode: profile?.stateCode ?? null,
    gstin: profile?.gstin ?? null,
    pan: profile?.pan ?? null,
    email: profile?.email ?? null,
    phone: profile?.phone ?? null,
    bankDetails: profile?.bankDetails ?? null,
    terms: profile?.terms ?? null,
  };
}

export function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "18.00%" reads badly next to "5.00%"; both look better without the trailing zeros. */
export function trimZeros(value: string): string {
  return value.replace(/\.?0+$/, '');
}

export function supplyLabel(supplyType: string): string {
  switch (supplyType) {
    case 'INTRA_STATE':
      return 'Within state';
    case 'INTER_STATE':
      return 'Inter-state';
    case 'EXPORT':
      return 'Export';
    default:
      return 'Exempt';
  }
}

export function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase().replaceAll('_', ' ');
}
