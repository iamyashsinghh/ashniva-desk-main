import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';

import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { BillingRepository, type InvoiceDetailRow } from './billing.repository';
import {
  MARGIN,
  profileAsSupplier,
  renderInvoiceDocument,
  type SnapshotShape,
} from './invoice-pdf-layout';

export type { SnapshotShape } from './invoice-pdf-layout';

/**
 * The invoice PDF.
 *
 * The supplier's details and the bank instructions come from the billing profile, so nothing here
 * is hardcoded to one company. Where the invoice carries a snapshot — everything after it was
 * issued — that snapshot is used rather than the live profile, because a document must not change
 * because someone later corrected an address.
 *
 * The document carries no images. `BillingProfile.logoFileId` and `signatureFileId` are stored
 * and returned by the API but nothing reads them; this comment used to claim branding came from
 * the profile, which was not true of anything a reader would recognise as branding. Rendering
 * them is deliberately left undone rather than done unsafely: a file id on the profile is not
 * proof the file belongs to the organization, so whoever adds it must resolve the id through the
 * organization-scoped file lookup first — the check `AdminBrandingService.checkedLogoFileId`
 * makes — and never hand a stored id straight to storage.
 */
@Injectable()
export class InvoicePdfService {
  constructor(
    private readonly repository: BillingRepository,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Renders the invoice and stores it, returning the file row's id.
   *
   * A new file is created each time rather than overwriting: when a permitted change alters an
   * issued invoice, the previous document stays retrievable through the history.
   */
  async generate(invoice: InvoiceDetailRow, actorUserId: string): Promise<string> {
    const profile = await this.repository.findProfile(invoice.organizationId);
    const snapshot = (invoice.snapshot ?? null) as SnapshotShape | null;
    const bytes = await this.render(invoice, profile, snapshot);

    const storageKey = `invoices/${invoice.organizationId}/${invoice.id}/${randomUUID()}.pdf`;
    await this.storage.putObject({
      key: storageKey,
      body: bytes,
      contentType: 'application/pdf',
    });

    const file = await this.prisma.file.create({
      data: {
        organizationId: invoice.organizationId,
        name: `${invoice.numberLabel.replaceAll('/', '-')}.pdf`,
        contentType: 'application/pdf',
        sizeBytes: bytes.length,
        storageKey,
        // The invoice is a document the client receives, so the file is client-visible too.
        visibility: 'CLIENT',
        uploadedById: actorUserId,
      },
    });

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { pdfFileId: file.id },
    });

    return file.id;
  }

  /** Builds the document in memory. Kept separate so a test can render without storage. */
  render(
    invoice: InvoiceDetailRow,
    profile: Awaited<ReturnType<BillingRepository['findProfile']>>,
    snapshot: SnapshotShape | null,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        const supplier = snapshot?.supplier ?? profileAsSupplier(profile);
        renderInvoiceDocument(doc, invoice, supplier, snapshot);
        doc.end();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
}
