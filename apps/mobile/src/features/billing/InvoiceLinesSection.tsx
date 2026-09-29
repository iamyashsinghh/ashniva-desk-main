import type { InvoiceLineItem } from '@ashniva/types';
import { View } from 'react-native';

import { Section } from '../../shared/components/layout';
import { AppText, Divider } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { isZero, trimRate } from './billing-display';

/** A saved invoice's lines: what each is for, how it was priced, and what it comes to. */
export function InvoiceLinesSection({ lines }: { lines: readonly InvoiceLineItem[] }) {
  const theme = useTheme();
  return (
    <Section title="Lines" count={lines.length} icon="list-outline">
      {lines.map((line, index) => (
        <View key={line.id} style={{ gap: theme.spacing.sm }}>
          {index > 0 ? <Divider /> : null}
          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText size="sm" weight="medium">
                {line.description}
              </AppText>
              <AppText size="xs" tone="faint">
                {line.hsnSac ? `HSN ${line.hsnSac} · ` : ''}
                {line.quantity} {line.unit} × {line.unitPrice} · {trimRate(line.taxRate)}% GST
              </AppText>
              {discountText(line) ? (
                <AppText size="xs" tone="faint">
                  {discountText(line)}
                </AppText>
              ) : null}
              <AppText size="xs" tone="muted">
                Taxable {line.taxableValue}
              </AppText>
            </View>
            <AppText weight="medium" align="right" tabular>
              {line.lineTotal}
            </AppText>
          </View>
        </View>
      ))}
    </Section>
  );
}

function discountText(line: InvoiceLineItem): string | null {
  const parts: string[] = [];
  if (!isZero(line.discountPercent)) {
    parts.push(`${trimRate(line.discountPercent)}% off`);
  }
  if (!isZero(line.discountAmount)) {
    parts.push(`${line.discountAmount} off`);
  }
  return parts.length ? `Discount ${parts.join(' + ')}` : null;
}
