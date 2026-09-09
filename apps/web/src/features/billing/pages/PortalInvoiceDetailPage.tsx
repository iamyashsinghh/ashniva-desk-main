import { SUPPLY_TYPE_LABELS, type PortalInvoiceDetail } from '@ashniva/types';
import { Badge, Button, Card, PageHeader } from '@ashniva/ui';
import { useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { InvoiceStatusPill } from '../../../shared/components/StatusPills';
import { formatDate } from '../../../shared/lib/format';
import { downloadInvoicePdf, usePortalInvoiceQuery } from '../api';
import { InvoiceTotals } from '../components/InvoiceTotals';

import '../billing.css';

/** One of the client's own invoices. Nothing internal has a field on this shape. */
export function PortalInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = usePortalInvoiceQuery(id);

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

function Loaded({ invoice }: { invoice: PortalInvoiceDetail }) {
  return (
    <div className="billing-page">
      <PageHeader
        title={invoice.numberLabel}
        subtitle={`Issued ${formatDate(invoice.issueDate)} · due ${formatDate(invoice.dueDate)}`}
        actions={
          invoice.hasPdf ? (
            <Button
              variant="primary"
              onClick={() => void downloadInvoicePdf(invoice.id, invoice.numberLabel, true)}
            >
              Download PDF
            </Button>
          ) : undefined
        }
      >
        <InvoiceStatusPill status={invoice.status} />
        {invoice.isOverdue ? <Badge tone="danger">Overdue</Badge> : null}
        {invoice.reverseCharge ? <Badge tone="warning">Reverse charge</Badge> : null}
      </PageHeader>

      <div className="billing-page__columns">
        <div className="billing-page__main">
          <Card title="What you were billed for">
            <ul className="billing-lines">
              {invoice.lineItems.map((item) => (
                <li key={item.id} className="billing-lines__row">
                  <div>
                    <div>{item.description}</div>
                    <span className="muted">
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
              totals={{ ...invoice, discountTotal: invoice.discountTotal }}
              currency={invoice.currency}
              amountInWords={invoice.amountInWords}
              taxBreakdown={invoice.taxBreakdown}
            />
          </Card>

          {invoice.notes ? (
            <Card title="Notes">
              <p>{invoice.notes}</p>
            </Card>
          ) : null}
        </div>

        <div className="billing-page__aside">
          <Card title="Tax">
            <p className="muted">
              {SUPPLY_TYPE_LABELS[invoice.supplyType]}
              <br />
              Place of supply: {invoice.placeOfSupplyState}
            </p>
          </Card>

          <Card title="Payments received">
            {invoice.payments.length === 0 ? (
              <p className="muted">Nothing recorded against this invoice yet.</p>
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
        </div>
      </div>
    </div>
  );
}
