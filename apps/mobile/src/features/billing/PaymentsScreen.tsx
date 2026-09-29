import { PERMISSIONS, type PaymentSummary } from '@ashniva/types';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { ListFooterLoader, SuccessNote } from '../../shared/components/feedback';
import { AppText, Button, Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { SelectField } from '../../shared/components/SelectField';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { useClientOptions } from '../projects/project-form-options';
import { billingKeys, usePagedWithTotal } from './billing-api';
import { PaymentCard } from './PaymentCard';
import { RecordPaymentSheet } from './RecordPaymentSheet';

/**
 * Money received, newest first — the web's payments list, with a client filter (the one filter the
 * API takes) and a way to record a payment that is not tied to one invoice: the API settles the
 * client's oldest open invoices with it, or keeps it as a credit.
 *
 * "Record payment" needs `payment:record`, the permission `POST /payments` checks.
 */
export function PaymentsScreen() {
  const theme = useTheme();
  const { can } = useSession();
  const clients = useClientOptions();
  const [clientId, setClientId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState(false);

  const list = usePagedWithTotal<PaymentSummary>(billingKeys.payments({ clientId }), '/payments', {
    clientOrganizationId: clientId ?? undefined,
    limit: 25,
  });

  const header = (
    <View style={{ gap: theme.spacing.md }}>
      <SelectField
        label="Client"
        icon="business-outline"
        options={clients.options}
        loading={clients.isLoading}
        value={clientId ? [clientId] : []}
        onChange={(values) => setClientId(values[0] ?? null)}
        allowClear
        clearLabel="All clients"
        placeholder="All clients"
      />
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
        <AppText size="sm" tone="muted" style={{ flex: 1 }}>
          {list.total === null ? ' ' : `${list.total} recorded`}
        </AppText>
        {can(PERMISSIONS.PAYMENT_RECORD) ? (
          <Button
            label="Record payment"
            icon="add"
            size="sm"
            onPress={() => {
              setRecorded(false);
              setRecording(true);
            }}
          />
        ) : null}
      </View>
      {recorded ? <SuccessNote label="Payment recorded" /> : null}
    </View>
  );

  let empty = (
    <EmptyState
      title="Nothing received yet"
      description="Payments recorded against invoices appear here."
      icon="card-outline"
    />
  );
  if (list.isLoading) {
    empty = <LoadingState label="Loading payments" />;
  } else if (list.error) {
    empty = (
      <ErrorState
        message={errorMessage(list.error)}
        offline={list.error instanceof Error && list.error.name === 'NetworkError'}
        onRetry={list.refresh}
      />
    );
  }

  return (
    <Screen>
      <FlatList
        data={list.items}
        keyExtractor={(payment) => payment.id}
        contentContainerStyle={{
          gap: theme.spacing.sm,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={<PullRefresh busy={list.isRefreshing} onRefresh={list.refresh} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: theme.spacing.sm }}
        ListEmptyComponent={empty}
        ListFooterComponent={list.isLoadingMore ? <ListFooterLoader /> : undefined}
        renderItem={({ item }) => <PaymentCard payment={item} />}
      />
      {recording ? (
        <RecordPaymentSheet
          onClose={() => setRecording(false)}
          onDone={() => {
            setRecording(false);
            setRecorded(true);
          }}
        />
      ) : null}
    </Screen>
  );
}
