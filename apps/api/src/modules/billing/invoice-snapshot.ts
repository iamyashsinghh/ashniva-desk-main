/**
 * The details frozen onto an invoice when it is issued.
 *
 * Kept apart from the service because it is the answer to one question — what did this document
 * say at the moment it became real — and that answer must not drift as the service grows.
 */
import { type PrismaService } from '../../database/prisma.service';
import { type BillingRepository, type InvoiceDetailRow } from './billing.repository';

/**
 * Supplier and customer details as they stand right now.
 *
 * Frozen onto the invoice at issue so a later correction to the company address does not
 * retrospectively change a document someone has already filed.
 */
export async function buildInvoiceSnapshot(
  prisma: PrismaService,
  repository: BillingRepository,
  organizationId: string,
  invoice: InvoiceDetailRow,
) {
  const profile = await repository.findProfile(organizationId);
  const client = await prisma.organization.findUnique({
    where: { id: invoice.clientOrganizationId },
    select: { name: true },
  });
  // The provider's record of how this client is invoiced. This used to be
  // `repository.findProfile(invoice.clientOrganizationId)` — the client's own billing profile,
  // which the policy on that table can never hand to a provider, so it was always null and every
  // B2B invoice carried an empty "Bill to" block. Null is still a legitimate answer here, for a
  // client whose particulars nobody has recorded yet, and the fields below fall back exactly as
  // they did: an invoice still issues and still renders.
  const clientProfile = await repository.findClientProfile(
    organizationId,
    invoice.clientOrganizationId,
  );

  return {
    capturedAt: new Date().toISOString(),
    supplier: profile
      ? {
          legalName: profile.legalName,
          // The postal code belongs in the printed address, as `profileAsSupplier` already has
          // it: the snapshot is what the PDF reads once an invoice is issued, so leaving it out
          // here dropped it from every issued document. Existing snapshots are not rewritten —
          // a frozen document does not change because the code that writes new ones improved.
          address: [
            profile.addressLine1,
            profile.addressLine2,
            profile.city,
            profile.state,
            profile.postalCode,
          ]
            .filter(Boolean)
            .join(', '),
          stateCode: profile.stateCode,
          postalCode: profile.postalCode,
          gstin: profile.gstin,
          pan: profile.pan,
          email: profile.email,
          phone: profile.phone,
          bankDetails: profile.bankDetails,
          terms: profile.terms,
        }
      : null,
    customer: {
      name: clientProfile?.legalName ?? client?.name ?? 'Client',
      address: clientProfile
        ? [
            clientProfile.addressLine1,
            clientProfile.addressLine2,
            clientProfile.city,
            clientProfile.state,
            clientProfile.postalCode,
            clientProfile.country,
          ]
            .filter(Boolean)
            .join(', ')
        : null,
      gstin: clientProfile?.gstin ?? null,
      // The recipient's own state when it is known, and the place of supply when it is not. The
      // tax treatment is not read from here and never was: it comes from `placeOfSupplyCode`
      // against the supplier's state code, so the two cannot drift apart.
      stateCode: clientProfile?.stateCode ?? invoice.placeOfSupplyCode,
    },
    totals: {
      taxableValue: invoice.taxableValue.toFixed(2),
      taxTotal: invoice.taxTotal.toFixed(2),
      total: invoice.total.toFixed(2),
    },
  };
}
