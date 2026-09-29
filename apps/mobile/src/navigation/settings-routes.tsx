import { BrandingSettingsScreen } from '../features/settings/branding/BrandingSettingsScreen';
import { CommunicationSettingsScreen } from '../features/settings/communication/CommunicationSettingsScreen';
import { EmailSettingsScreen } from '../features/settings/email/EmailSettingsScreen';
import { ProductDetailScreen } from '../features/settings/products/ProductDetailScreen';
import { ProductsScreen } from '../features/settings/products/ProductsScreen';
import { SlaPoliciesScreen } from '../features/settings/sla/SlaPoliciesScreen';
import { SupportRoutingScreen } from '../features/settings/support-routing/SupportRoutingScreen';
import { WhatsAppSettingsScreen } from '../features/settings/whatsapp/WhatsAppSettingsScreen';
import type { RootStack } from './root-stack';

/**
 * Organisation settings: SLA policies, support routing, products, branding and integrations.
 *
 * A function returning route elements, like `projectRoutes`, because a navigator only accepts
 * `Screen` elements (or fragments of them) as children.
 */
export function settingsRoutes(Stack: RootStack) {
  return (
    <>
      <Stack.Screen
        name="SlaPolicies"
        options={{ title: 'SLA policies' }}
        component={SlaPoliciesScreen}
      />
      <Stack.Screen
        name="SupportRouting"
        options={{ title: 'Support routing' }}
        component={SupportRoutingScreen}
      />
      <Stack.Screen
        name="Products"
        options={{ title: 'Products' }}
        children={({ navigation }) => (
          <ProductsScreen onOpen={(id) => navigation.navigate('ProductDetail', { id })} />
        )}
      />
      <Stack.Screen
        name="ProductDetail"
        options={{ title: 'Product' }}
        children={({ route }) => <ProductDetailScreen productId={route.params.id} />}
      />
      <Stack.Screen
        name="BrandingSettings"
        options={{ title: 'Branding' }}
        component={BrandingSettingsScreen}
      />
      <Stack.Screen
        name="EmailSettings"
        options={{ title: 'Email' }}
        component={EmailSettingsScreen}
      />
      <Stack.Screen
        name="WhatsAppSettings"
        options={{ title: 'WhatsApp' }}
        component={WhatsAppSettingsScreen}
      />
      <Stack.Screen
        name="CommunicationSettings"
        options={{ title: 'Internal communication' }}
        component={CommunicationSettingsScreen}
      />
    </>
  );
}
