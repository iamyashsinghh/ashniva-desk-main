import {
  WORK_RELATION_TYPE,
  WORK_RELATION_TYPE_LABELS,
  type TicketRelationCandidatesResponse,
  type TicketRelationsResponse,
  type WorkRelationType,
} from '@ashniva/types';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { useApiMutation } from '../../../shared/api/mutations';
import { useResource } from '../../../shared/api/queries';
import { Banner } from '../../../shared/components/feedback';
import { Segmented } from '../../../shared/components/navigation-list';
import { AppText, Button, Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import { Sheet } from '../../../shared/components/Sheet';
import { useTheme } from '../../../shared/theme/ThemeProvider';

/**
 * Linking this ticket to another as a duplicate or a related one.
 *
 * The likely duplicates are the choice, with the reasons each was suggested, as in the web's
 * dialog; candidates are only fetched while the sheet is open, because the endpoint needs
 * `ticket:triage` and only somebody who may link ever opens it.
 */
export function LinkTicketSheet({
  visible,
  ticketId,
  onClose,
}: {
  visible: boolean;
  ticketId: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [type, setType] = useState<WorkRelationType>(WORK_RELATION_TYPE.DUPLICATE_OF);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [closeDuplicate, setCloseDuplicate] = useState(true);
  const duplicate = type === WORK_RELATION_TYPE.DUPLICATE_OF;

  const candidates = useResource<TicketRelationCandidatesResponse>(
    ['tickets', ticketId, 'relation-candidates'],
    `/tickets/${ticketId}/relations/candidates`,
    { enabled: visible },
  );
  const link = useApiMutation<void, TicketRelationsResponse>({
    path: `/tickets/${ticketId}/relations`,
    body: () => ({
      type,
      targetTicketId: targetId,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(duplicate ? { closeDuplicate } : {}),
    }),
    invalidate: [['tickets'], ['portal']],
    onSuccess: () => {
      setTargetId(null);
      setNote('');
      onClose();
    },
  });

  const options = (candidates.data?.candidates ?? [])
    .filter((candidate) => !candidate.alreadyLinked)
    .map((candidate) => ({
      value: candidate.ticketId,
      label: `${candidate.key} · ${candidate.title}`,
      description: [candidate.clientOrganizationName, ...candidate.signals].join(' · '),
    }));

  return (
    <Sheet
      visible={visible}
      title="Link this ticket"
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label={duplicate ? 'Mark as duplicate' : 'Link'}
            icon="link-outline"
            loading={link.busy}
            disabled={!targetId}
            onPress={() => void link.run()}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Segmented
        label="Relationship"
        value={type}
        onChange={setType}
        options={Object.values(WORK_RELATION_TYPE).map((value) => ({
          value,
          label: WORK_RELATION_TYPE_LABELS[value],
        }))}
      />
      <SelectField
        label="Ticket"
        required
        icon="ticket-outline"
        options={options}
        value={targetId ? [targetId] : []}
        onChange={(ids) => setTargetId(ids[0] ?? null)}
        loading={candidates.isLoading}
        placeholder={
          options.length > 0 ? 'Choose a likely duplicate' : 'No likely duplicates found'
        }
      />
      <Field label="Note" hint="Internal. The client never reads it.">
        <Input accessibilityLabel="Note" value={note} onChangeText={setNote} />
      </Field>
      {duplicate ? (
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText weight="medium">Close this ticket as a duplicate</AppText>
            <AppText size="xs" tone="muted">
              Nothing is merged: both tickets keep their replies, attachments, SLA record and
              history.
            </AppText>
          </View>
          <Switch
            accessibilityLabel="Close this ticket as a duplicate"
            value={closeDuplicate}
            onValueChange={setCloseDuplicate}
            trackColor={{ true: theme.colors.primary, false: theme.colors.borderStrong }}
          />
        </View>
      ) : null}
      {link.error ? (
        <Banner tone="danger" role="alert">
          {link.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
