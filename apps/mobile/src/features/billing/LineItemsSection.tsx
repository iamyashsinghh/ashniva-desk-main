import type { CalculationPreview } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { MetaLine } from '../../shared/components/data-display';
import { PressableCard, Section } from '../../shared/components/layout';
import { AppText, Button } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { trimRate } from './billing-display';
import { emptyLine, lineProblem, type LineDraft } from './invoice-form';
import { LineItemSheet } from './LineItemSheet';

/**
 * The editor's lines as cards, each opening a sheet to change or remove it, and an "Add line" that
 * opens the same sheet blank.
 *
 * A line's total is the server's, from the preview, and only shown while the preview is current —
 * the phone never multiplies a price by a quantity itself.
 */
export function LineItemsSection({
  lines,
  onChange,
  defaultTaxRate,
  preview,
}: {
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  defaultTaxRate: string;
  preview: CalculationPreview | null;
}) {
  const theme = useTheme();
  const [editing, setEditing] = useState<{ line: LineDraft; isNew: boolean } | null>(null);

  const save = (line: LineDraft) => {
    const exists = lines.some((row) => row.key === line.key);
    onChange(exists ? lines.map((row) => (row.key === line.key ? line : row)) : [...lines, line]);
    setEditing(null);
  };
  const remove = (key: string) => {
    onChange(lines.filter((row) => row.key !== key));
    setEditing(null);
  };

  return (
    <Section
      title="Lines"
      count={lines.length}
      icon="list-outline"
      action={
        <Button
          label="Add line"
          icon="add"
          size="sm"
          variant="secondary"
          onPress={() => setEditing({ line: emptyLine(defaultTaxRate), isNew: true })}
        />
      }
    >
      {lines.length === 0 ? (
        <AppText size="sm" tone="muted">
          No lines yet. An invoice needs at least one.
        </AppText>
      ) : null}
      {lines.map((line, index) => {
        const problem = lineProblem(line);
        const total = preview?.lines[index]?.lineTotal;
        return (
          <PressableCard
            key={line.key}
            accessibilityLabel={`Line ${index + 1}: ${line.description || 'no description'}`}
            accessibilityHint="Opens the line to change or remove it"
            onPress={() => setEditing({ line, isNew: false })}
            style={{ backgroundColor: theme.colors.surfaceRaised }}
          >
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <AppText weight="medium" numberOfLines={2} style={{ flex: 1 }}>
                {line.description || 'No description'}
              </AppText>
              {total ? (
                <AppText weight="medium" tabular>
                  {total}
                </AppText>
              ) : null}
            </View>
            <AppText size="xs" tone="faint">
              {line.hsnSac ? `HSN ${line.hsnSac} · ` : ''}
              {line.quantity} {line.unit || 'Nos'} × {line.unitPrice || '—'} ·{' '}
              {trimRate(line.taxRate || '0')}% GST
            </AppText>
            {problem ? (
              <MetaLine icon="alert-circle-outline" danger>
                {problem}
              </MetaLine>
            ) : null}
          </PressableCard>
        );
      })}
      {editing ? (
        <LineItemSheet
          line={editing.line}
          isNew={editing.isNew}
          onSave={save}
          onRemove={() => remove(editing.line.key)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Section>
  );
}
