import {
  CLIENT_VISIBLE_INVOICE_STATUSES,
  PERMISSIONS,
  VISIBILITY,
  type AuthenticatedUser,
  type InvoiceStatus,
  type Visibility,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import type { FileRow } from './files.repository';

/**
 * Which attachments a caller may see at all, separately from which parent they are asking about.
 *
 * `undefined` means "both kinds"; anything else narrows the query to client-visible rows.
 *
 * An INTERNAL file is internal working material — the same material `comment:internal` governs on
 * the entity it hangs off. An internal user without that key, an internal employee whose whole
 * permission set is raising and reading tickets, has no business reading the estimates, failure
 * notes and internal documents attached to other people's work. `GET /files` used to pass
 * `visibility: undefined` for every internal caller, which is how one came to hold three
 * different clients' internal attachments.
 */
export function readableVisibility(actor: AuthenticatedUser): Visibility | undefined {
  if (!isInternalUser(actor)) {
    return VISIBILITY.CLIENT;
  }
  return actor.permissions.includes(PERMISSIONS.COMMENT_INTERNAL) ? undefined : VISIBILITY.CLIENT;
}

/** A client reads a file only when it is client-visible and attached to their own work. */
export function clientMayRead(actor: AuthenticatedUser, row: FileRow): boolean {
  if (row.visibility !== VISIBILITY.CLIENT) {
    return false;
  }
  const owners = [
    row.task?.project.clientOrganizationId,
    row.ticket?.clientOrganizationId,
    row.project?.clientOrganizationId,
    row.contract?.clientOrganizationId,
    row.changeRequest?.clientOrganizationId,
    row.approval?.clientOrganizationId,
    row.milestone?.clientVisible ? row.milestone.project.clientOrganizationId : undefined,
    // The invoice this file is the PDF of — but only while that invoice is one the client is
    // allowed to see. The link on its own is not authority: a cancelled invoice keeps its row,
    // a soft-deleted one keeps its link, and `findForClient` refuses both. Nulling the link on
    // cancel is defence in depth; this is the defence.
    ...row.invoicePdfs
      .filter(
        (invoice) =>
          invoice.deletedAt === null &&
          CLIENT_VISIBLE_INVOICE_STATUSES.includes(invoice.status as InvoiceStatus),
      )
      .map((invoice) => invoice.clientOrganizationId),
  ];
  return owners.includes(actor.organizationId) || row.uploadedById === actor.userId;
}
