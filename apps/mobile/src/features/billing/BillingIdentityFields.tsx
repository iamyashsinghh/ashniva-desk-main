import { Section } from '../../shared/components/layout';
import type { BindProfileField } from './billing-form';
import { TextField } from './TextField';

/**
 * Who the invoice is from.
 *
 * The state code is the field with consequences: it decides whether GST splits into CGST and SGST
 * or is charged as IGST, so its hint says so rather than leaving it as another box to fill in.
 */
export function BillingIdentityFields({ bind }: { bind: BindProfileField }) {
  const upper = (value: string) => value.toUpperCase();
  return (
    <>
      <Section title="Legal identity" icon="business-outline">
        <TextField label="Legal business name" required maxLength={200} {...bind('legalName')} />
        <TextField
          label="GSTIN"
          hint="15 characters, e.g. 29AABCU9603R1ZM"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={15}
          {...bind('gstin', upper)}
        />
        <TextField
          label="PAN"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={10}
          {...bind('pan', upper)}
        />
        <TextField
          label="Billing email"
          required
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          {...bind('email')}
        />
        <TextField label="Phone" keyboardType="phone-pad" {...bind('phone')} />
      </Section>

      <Section title="Address" icon="location-outline">
        <TextField label="Address line 1" required {...bind('addressLine1')} />
        <TextField label="Address line 2" {...bind('addressLine2')} />
        <TextField label="City" required {...bind('city')} />
        <TextField label="State" required {...bind('state')} />
        <TextField
          label="State code"
          required
          hint="Two digits. Decides CGST+SGST versus IGST on every invoice."
          keyboardType="number-pad"
          maxLength={2}
          {...bind('stateCode')}
        />
        <TextField label="Postal code" required keyboardType="number-pad" {...bind('postalCode')} />
        <TextField label="Country" {...bind('country')} />
      </Section>
    </>
  );
}
