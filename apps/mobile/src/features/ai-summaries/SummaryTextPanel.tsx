import { useState } from 'react';
import { View } from 'react-native';

import { Banner } from '../../shared/components/feedback';
import { Section } from '../../shared/components/layout';
import { AppText, Button, Input, Pill } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useEditAiSummary } from './api';

type Field = 'internalContent' | 'clientContent';

/** The API's limit on either text. */
const MAX_LENGTH = 20000;

/**
 * One block of the summary's text, readable and — while it is still being written — editable.
 *
 * The internal and client versions sit one above the other because a reviewer has to compare
 * them: the question is whether the client version says anything it should not.
 */
export function SummaryTextPanel({
  summaryId,
  field,
  title,
  hint,
  value,
  editable,
  internal = false,
}: {
  summaryId: string;
  field: Field;
  title: string;
  hint: string;
  value: string | null;
  editable: boolean;
  internal?: boolean;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <Section
      title={title}
      icon={internal ? 'lock-closed-outline' : 'people-outline'}
      action={internal ? <Pill label="Never shown to a client" tone="warning" /> : undefined}
    >
      <AppText size="sm" tone="muted">
        {hint}
      </AppText>
      {value ? (
        <View
          style={{
            backgroundColor: internal ? theme.colors.warningSoft : theme.colors.surfaceSunken,
            borderRadius: theme.radius.sm,
            padding: theme.spacing.md,
          }}
        >
          <AppText>{value}</AppText>
        </View>
      ) : (
        <AppText tone="faint">Nothing here yet.</AppText>
      )}
      {editable ? (
        <Button
          label={value ? 'Edit' : 'Write it'}
          icon="create-outline"
          variant="secondary"
          size="sm"
          onPress={() => setDraft(value ?? '')}
        />
      ) : null}
      <EditTextSheet
        summaryId={summaryId}
        field={field}
        title={title}
        draft={draft}
        onChange={setDraft}
        onClose={() => setDraft(null)}
      />
    </Section>
  );
}

function EditTextSheet({
  summaryId,
  field,
  title,
  draft,
  onChange,
  onClose,
}: {
  summaryId: string;
  field: Field;
  title: string;
  draft: string | null;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const edit = useEditAiSummary(summaryId);

  const save = async () => {
    if (await edit.run({ [field]: draft ?? '' })) {
      onClose();
    }
  };

  return (
    <Sheet
      visible={draft !== null}
      title={`Edit ${title.toLowerCase()}`}
      onClose={onClose}
      maxHeightRatio={0.92}
      footer={
        <>
          <Button label="Discard" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Save"
            icon="checkmark"
            loading={edit.busy}
            onPress={() => void save()}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Input
        multiline
        value={draft ?? ''}
        onChangeText={(text) => {
          edit.reset();
          onChange(text);
        }}
        maxLength={MAX_LENGTH}
        accessibilityLabel={title}
        style={{ minHeight: 220 }}
        autoFocus
      />
      {edit.error ? (
        <Banner tone="danger" role="alert">
          {edit.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
