import { BillingInvoiceDetailScreen } from '../features/billing/BillingInvoiceDetailScreen';
import { BillingInvoicesScreen } from '../features/billing/BillingInvoicesScreen';
import { BillingSettingsScreen } from '../features/billing/BillingSettingsScreen';
import { InvoiceEditorScreen } from '../features/billing/InvoiceEditorScreen';
import { PaymentsScreen } from '../features/billing/PaymentsScreen';
import type { RootStack } from './root-stack';

/**
 * Billing on the provider's side: invoices, the editor, payments and the billing settings.
 *
 * A function returning a fragment rather than a component, because a navigator only accepts
 * `Screen` elements (or fragments of them) as children — a component wrapping them is ignored.
 */
export function billingRoutes(Stack: RootStack) {
  return (
    <>
      <Stack.Screen
        name="BillingInvoices"
        options={{ title: 'Invoices' }}
        children={({ navigation }) => (
          <BillingInvoicesScreen
            onOpen={(id) => navigation.navigate('BillingInvoiceDetail', { id })}
            onCreate={() => navigation.navigate('InvoiceEditor')}
          />
        )}
      />
      <Stack.Screen
        name="BillingInvoiceDetail"
        options={{ title: 'Invoice' }}
        children={({ route, navigation }) => (
          <BillingInvoiceDetailScreen
            invoiceId={route.params.id}
            onEdit={(id) => navigation.navigate('InvoiceEditor', { id })}
            onOpenProject={(id) => navigation.navigate('ProjectDetail', { id })}
            onOpenContract={(id) => navigation.navigate('ContractDetail', { id })}
          />
        )}
      />
      <Stack.Screen
        name="InvoiceEditor"
        options={({ route }) => ({ title: route.params?.id ? 'Edit draft' : 'New invoice' })}
        children={({ route, navigation }) => (
          <InvoiceEditorScreen
            invoiceId={route.params?.id ?? null}
            onSaved={(invoice, created) =>
              created
                ? navigation.replace('BillingInvoiceDetail', { id: invoice.id })
                : navigation.goBack()
            }
            onOpenSettings={() => navigation.navigate('BillingSettings')}
          />
        )}
      />
      <Stack.Screen name="Payments" options={{ title: 'Payments' }} component={PaymentsScreen} />
      <Stack.Screen
        name="BillingSettings"
        options={{ title: 'Billing' }}
        component={BillingSettingsScreen}
      />
    </>
  );
}
