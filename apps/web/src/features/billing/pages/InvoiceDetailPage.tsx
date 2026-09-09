import {
  PERMISSIONS,
  SUPPLY_TYPE_LABELS,
  isInvoiceEditable,
  type InvoiceDetail,
} from '@ashniva/types';
import { Badge, Button, Card, PageHeader } from '@ashniva/ui';
import { useState } from 'react';
import { useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { InvoiceStatusPill } from '../../../shared/components/StatusPills';
import { errorMessage } from '../../../shared/lib/api-client';
import { formatDate, formatDateTime } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { downloadInvoicePdf, useBillingMutations, useInvoiceQuery } from '../api';
import { InvoiceReasonModal } from '../components/InvoiceReasonModal';
import { InvoiceTotals } from '../components/InvoiceTotals';
import { RecordPaymentModal } from '../components/RecordPaymentModal';

import '../billing.css';

/** One invoice: its lines, tax breakdown, payments and history. */
export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useInvoiceQuery(id);

  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <Loaded invoice={query.data} /> : null}
    </QueryState>
  );
}

function Loaded({ invoice }: { invoice: InvoiceDetail }) {
  const [closing, setClosing] = useState<'cancel' | 'void' | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canIssue = usePermission(PERMISSIONS.INVOICE_ISSUE);
  const canVoid = usePermission(PERMISSIONS.INVOICE_VOID);
  const canRecord = usePermission(PERMISSIONS.PAYMENT_RECORD);
  const { issue, reminder } = useBillingMutations(invoice.id);

  const editable = isInvoiceEditable(invoice.status);
  // Only an invoice the client has actually been sent can take a payment. A draft has not been
  // sent and a cancelled or void one has been withdrawn; the API refuses all three with
  // "does not exist or is not yours", which reads as a bug when it is offered on the provider's
  // own draft.
  const owes =
    invoice.balanceDue !== '0.00' &&
    (['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] as const).includes(
      invoice.status as 'ISSUED' | 'PARTIALLY_PAID' | 'OVERDUE',
    );

  const run = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <div className="billing-page">
      <PageHeader
        title={editable ? 'Draft invoice' : invoice.numberLabel}
        subtitle={`${invoice.clientName} · issued ${formatDate(invoice.issueDate)} · due ${formatDate(invoice.dueDate)}`}
        actions={
          <div className="detail-actions">
            {editable && canIssue ? (
              <Button
                variant="primary"
                loading={issue.isPending}
                onClick={() => void run(() => issue.mutateAsync())}
              >
                Issue invoice
              </Button>
            ) : null}
            {!editable ? (
              <Button
                onClick={() => void run(() => downloadInvoicePdf(invoice.id, invoice.numberLabel))}
                disabled={!invoice.pdfFileId}
                disabledReason="The PDF is generated when the invoice is issued"
              >
                Download PDF
              </Button>
            ) : null}
            {owes && canRecord ? (
              <Button onClick={() => setRecording(true)}>Record payment</Button>
            ) : null}
            {owes && !editable ? (
              <Button
                loading={reminder.isPending}
                onClick={() => void run(() => reminder.mutateAsync())}
              >
                Mark reminder sent
              </Button>
            ) : null}
            {canVoid && invoice.status !== 'VOID' && invoice.status !== 'CANCELLED' ? (
              <Button variant="danger" onClick={() => setClosing(editable ? 'cancel' : 'void')}>
                {editable ? 'Cancel' : 'Void'}
              </Button>
            ) : null}
          </div>
        }
      >
        <InvoiceStatusPill status={invoice.status} />
        {invoice.isOverdue ? <Badge tone="danger">Overdue</Badge> : null}
        {invoice.reverseCharge ? <Badge tone="warning">Reverse charge</Badge> : null}
      </PageHeader>

      {error ? <p className="form-error">{error}</p> : null}

      {invoice.voidReason || invoice.cancelReason ? (
        <Card title={invoice.voidReason ? 'Voided' : 'Cancelled'}>
          <p>{invoice.voidReason ?? invoice.cancelReason}</p>
        </Card>
      ) : null}

      <div className="billing-page__columns">
        <div className="billing-page__main">
          <Card title={`Lines (${invoice.lineItems.length})`}>
            <ul className="billing-lines">
              {invoice.lineItems.map((item) => (
                <li key={item.id} className="billing-lines__row">
                  <div>
                    <div>{item.description}</div>
                    <span className="muted">
                      {item.hsnSac ? `HSN ${item.hsnSac} · ` : ''}
                      {item.quantity} {item.unit} × {item.unitPrice} · {item.taxRate}% GST
                    </span>
                  </div>
                  <span className="money">{item.taxableValue}</span>
                  <span className="money">{item.lineTotal}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Totals">
            <InvoiceTotals
              totals={invoice}
              currency={invoice.currency}
              amountInWords={invoice.amountInWords}
              taxBreakdown={invoice.taxBreakdown}
            />
          </Card>

          {invoice.notes ? (
            <Card title="Notes for the client">
              <p>{invoice.notes}</p>
            </Card>
          ) : null}

          {/* Visually separated, because it must never be read out to a client by mistake. */}
          {invoice.internalNotes ? (
            <Card
              title="Internal notes"
              headerAddon={<Badge tone="warning">Never shown to the client</Badge>}
            >
              <div className="billing-internal">{invoice.internalNotes}</div>
            </Card>
          ) : null}
        </div>

        <div className="billing-page__aside">
          <Card title="Tax treatment">
            <p className="muted">
              {SUPPLY_TYPE_LABELS[invoice.supplyType]}
              <br />
              Place of supply: {invoice.placeOfSupplyState} ({invoice.placeOfSupplyCode})
            </p>
          </Card>

          <Card title={`Payments (${invoice.payments.length})`}>
            {invoice.payments.length === 0 ? (
              <p className="muted">Nothing received yet.</p>
            ) : (
              <ul className="billing-lines">
                {invoice.payments.map((payment) => (
                  <li key={payment.paymentId} className="billing-lines__row">
                    <div>
                      <div>{payment.reference}</div>
                      <span className="muted">{formatDate(payment.paidAt)}</span>
                    </div>
                    <span />
                    <span className="money">{payment.allocatedAmount}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="History">
            {invoice.history.length === 0 ? (
              <p className="muted">Nothing has happened yet.</p>
            ) : (
              <ol className="release-note-history">
                {invoice.history.map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.toStatus}</strong>
                    <span className="muted">
                      {entry.changedByName} · {formatDateTime(entry.createdAt)}
                    </span>
                    {entry.note ? <p>{entry.note}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      {closing ? (
        <InvoiceReasonModal
          invoiceId={invoice.id}
          action={closing}
          onClose={() => setClosing(null)}
        />
      ) : null}
      {recording ? (
        <RecordPaymentModal invoice={invoice} onClose={() => setRecording(false)} />
      ) : null}
    </div>
  );
}
