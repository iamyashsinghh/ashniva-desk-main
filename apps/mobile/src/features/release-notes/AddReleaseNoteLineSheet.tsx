import {
  RELEASE_NOTE_ITEM_KIND,
  RELEASE_NOTE_ITEM_KIND_LABELS,
  type ReleaseNoteItemKind,
} from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { Chip } from '../../shared/components/chips';
import { Banner } from '../../shared/components/feedback';
import { AppText, Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { SheetButtons } from '../releases/SheetButtons';
import { ToggleRow } from '../tasks/ToggleRow';
import { useReleaseNoteWrite } from './release-note-api';

const KINDS = Object.values(RELEASE_NOTE_ITEM_KIND);

interface LineInput {
  kind: ReleaseNoteItemKind;
  label: string;
  clientVisible: boolean;
}

/** Add a line the generator did not find, or one written from scratch. */
export function AddReleaseNoteLineSheet({
  noteId,
  onClose,
}: {
  noteId: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [form, setForm] = useState<LineInput>({
    kind: RELEASE_NOTE_ITEM_KIND.MANUAL,
    label: '',
    clientVisible: true,
  });
  const add = useReleaseNoteWrite<LineInput>(noteId, 'items', {
    body: (input) => input,
    onSuccess: onClose,
  });
  const label = form.label.trim();

  return (
    <Sheet
      visible
      title="Add a line"
      onClose={onClose}
      footer={
        <SheetButtons
          confirmLabel="Add"
          confirmIcon="add"
          busy={add.busy}
          disabled={label.length === 0 || label.length > 500}
          onCancel={onClose}
          onConfirm={() => void add.run({ ...form, label })}
        />
      }
    >
      <View style={{ gap: theme.spacing.sm }}>
        <AppText size="sm" weight="medium">
          Kind
        </AppText>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Kind"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}
        >
          {KINDS.map((kind) => (
            <Chip
              key={kind}
              label={RELEASE_NOTE_ITEM_KIND_LABELS[kind]}
              role="radio"
              selected={form.kind === kind}
              onPress={() => setForm((current) => ({ ...current, kind }))}
            />
          ))}
        </View>
      </View>
      <Field label="What changed" required hint="Write it the way the client would say it.">
        <Input
          accessibilityLabel="What changed"
          multiline
          numberOfLines={2}
          style={{ minHeight: 72 }}
          value={form.label}
          onChangeText={(value) => setForm((current) => ({ ...current, label: value }))}
        />
      </Field>
      <ToggleRow
        label="Show this line to the client"
        description={
          form.clientVisible
            ? 'The client reads this line once the note is published.'
            : 'Internal only — kept on the note, dropped from the client’s copy.'
        }
        value={form.clientVisible}
        onChange={(clientVisible) => setForm((current) => ({ ...current, clientVisible }))}
      />
      {add.error ? (
        <Banner tone="danger" role="alert">
          {add.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
