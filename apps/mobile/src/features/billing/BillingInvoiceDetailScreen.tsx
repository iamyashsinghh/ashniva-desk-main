import {
  INVOICE_STATUS_LABELS,
  PERMISSIONS,
  isInvoiceEditable,
  type InvoiceDetail,
} from '@ashniva/types';
import { ScrollView } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import {
  ListRow,
  MetaLine,
  StatTile,
  TileGrid,
  type StatTone,
} from '../../shared/components/data-display';
import { Banner } from '../../shared/components/feedback';
import { Hero, Section } from '../../shared/components/layout';
import { AppText, Pill, PillRow, Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { billingKeys } from './billing-api';
import {
  invoiceDate,
  invoiceIconTone,
  invoiceTitle,
  invoiceTone,
  isZero,
  money,
} from './billing-display';
import { InvoiceActionBar } from './InvoiceActionBar';
import { InvoiceLinesSection } from './InvoiceLinesSection';
import { InvoiceRecordSections } from './InvoiceRecordSections';
import { InvoiceTotalsCard } from './InvoiceTotalsCard';

/**
 * One invoice on the provider's side: its lines, totals and tax breakdown, notes, payments and
 * history, with every action the web page offers pinned at the foot.
 *
 * The PDF is the one thing left to the web app — saving or sharing a file on a phone needs a
 * native module this app does not ship yet, so the screen says so rather than offering a button
 * that cannot work.
 */
export function BillingInvoiceDetailScreen({
  invoiceId,
  onEdit,
  onOpenProject,
  onOpenContract,
}: {
  invoiceId: string;
  onEdit: (invoiceId: string) => void;
  onOpenProject?: (projectId: string) => void;
  onOpenContract?: (contractId: string) => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const query = useResource<InvoiceDetail>(
    billingKeys.invoice(invoiceId),
    `/invoices/${invoiceId}`,
  );
  const invoice = query.data ?? null;
  const refresh = () => void query.refetch();

  if (!invoice && query.error) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(query.error)}
          offline={query.error instanceof Error && query.error.name === 'NetworkError'}
          onRetry={refresh}
        />
      </Screen>
    );
  }
  if (!invoice) {
    return (
      <Screen>
        <LoadingState label="Loading the invoice" />
      </Screen>
    );
  }

  const draft = isInvoiceEditable(invoice.status);
  const closedReason = invoice.voidReason ?? invoice.cancelReason;
  const projectLink = can(PERMISSIONS.PROJECT_READ) ? invoice.projectId : null;
  const contractLink = can(PERMISSIONS.CONTRACT_READ) ? invoice.contractId : null;
  let balanceTone: StatTone = 'default';
  if (invoice.isOverdue) {
    balanceTone = 'danger';
  } else if (isZero(invoice.balanceDue)) {
    balanceTone = 'success';
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={<PullRefresh busy={query.isRefetching} onRefresh={refresh} />}
      >
        <Hero
          overline={invoice.clientName}
          title={invoiceTitle(invoice)}
          icon={draft ? 'document-outline' : 'receipt'}
          iconTone={invoiceIconTone(invoice.status, invoice.isOverdue)}
        >
          <PillRow>
            <Pill
              label={INVOICE_STATUS_LABELS[invoice.status]}
              tone={invoiceTone(invoice.status)}
            />
            {invoice.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
            {invoice.reverseCharge ? <Pill label="Reverse charge" tone="warning" /> : null}
          </PillRow>
          <MetaLine icon="calendar-outline">
            Issued {invoiceDate(invoice.issueDate)}
            {invoice.dueDate ? ` · due ${invoiceDate(invoice.dueDate)}` : ''}
          </MetaLine>
        </Hero>

        <TileGrid>
          <StatTile
            label="Total"
            value={money(invoice.currency, invoice.total)}
            icon="receipt-outline"
          />
          <StatTile
            label="Balance due"
            value={money(invoice.currency, invoice.balanceDue)}
            icon="wallet-outline"
            tone={balanceTone}
          />
        </TileGrid>

        {closedReason ? (
          <Banner tone="neutral" title={invoice.voidReason ? 'Voided' : 'Cancelled'}>
            {closedReason}
          </Banner>
        ) : null}

        <InvoiceLinesSection lines={invoice.lineItems} />

        <InvoiceTotalsCard
          totals={invoice}
          currency={invoice.currency}
          amountInWords={invoice.amountInWords}
          taxBreakdown={invoice.taxBreakdown}
        />

        {invoice.notes ? (
          <Section title="Notes for the client" icon="chatbox-outline">
            <AppText>{invoice.notes}</AppText>
          </Section>
        ) : null}

        {/* A tinted strip, so it cannot be read out to a client by mistake. */}
        {invoice.internalNotes ? (
          <Banner tone="warning" title="Internal notes — never shown to the client">
            <AppText size="sm">{invoice.internalNotes}</AppText>
          </Banner>
        ) : null}

        {(projectLink && onOpenProject) || (contractLink && onOpenContract) ? (
          <Section title="Raised against" icon="link-outline">
            {projectLink && onOpenProject ? (
              <ListRow
                title="Project"
                subtitle="Open the project this invoice bills"
                icon="folder-open-outline"
                onPress={() => onOpenProject(projectLink)}
              />
            ) : null}
            {contractLink && onOpenContract ? (
              <ListRow
                title="Contract"
                subtitle="Open the contract this invoice bills"
                icon="document-text-outline"
                onPress={() => onOpenContract(contractLink)}
              />
            ) : null}
          </Section>
        ) : null}

        <InvoiceRecordSections invoice={invoice} />

        {draft ? null : (
          <AppText size="xs" tone="faint" align="center">
            {invoice.pdfFileId
              ? 'The PDF can be downloaded from the web app.'
              : 'The PDF is generated when the invoice is issued.'}
          </AppText>
        )}
      </ScrollView>
      <InvoiceActionBar invoice={invoice} onEdit={() => onEdit(invoice.id)} />
    </Screen>
  );
}
