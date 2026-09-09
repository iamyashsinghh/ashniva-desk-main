import { RELEASE_ITEM_KIND, type ReleaseDetail, type ReleaseItemKind } from '@ashniva/types';
import { Alert, Button, FormField, FormGrid, Modal, Select } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useChangeRequestsQuery } from '../../change-requests/api';
import { useTasksQuery } from '../../tasks/api';
import { useTicketsQuery } from '../../tickets/api';
import { useReleaseMutations, type AddReleaseItemInput } from '../api';
import { ITEM_KIND_LABELS } from '../release-display';

const KINDS = Object.values(RELEASE_ITEM_KIND);

interface Choice {
  id: string;
  label: string;
}

/**
 * The work that can still be added: everything on this release's project of the chosen kind, less
 * what is already in the list. The API scopes the lookup to the project too — a release must not
 * be made to carry another client's work — so this only saves the operator a refusal.
 */
function useChoices(
  kind: ReleaseItemKind,
  release: ReleaseDetail,
): { loading: boolean; choices: Choice[] } {
  const projectId = release.projectId;
  const tasks = useTasksQuery({ projectId }, kind === RELEASE_ITEM_KIND.TASK);
  const tickets = useTicketsQuery({ projectId });
  const changes = useChangeRequestsQuery({ projectId }, kind === RELEASE_ITEM_KIND.CHANGE_REQUEST);
  const taken = new Set(
    release.items.map((item) => item.taskId ?? item.ticketId ?? item.changeRequestId),
  );
  const keep = (choice: Choice) => !taken.has(choice.id);

  if (kind === RELEASE_ITEM_KIND.TASK) {
    return {
      loading: tasks.isLoading,
      choices: (tasks.data?.items ?? [])
        .map((task) => ({ id: task.id, label: `${task.key} — ${task.title}` }))
        .filter(keep),
    };
  }
  if (kind === RELEASE_ITEM_KIND.TICKET) {
    return {
      loading: tickets.isLoading,
      choices: (tickets.data?.items ?? [])
        .map((ticket) => ({ id: ticket.id, label: `${ticket.key} — ${ticket.title}` }))
        .filter(keep),
    };
  }
  return {
    loading: changes.isLoading,
    choices: (changes.data?.items ?? [])
      .map((change) => ({ id: change.id, label: `${change.number} — ${change.title}` }))
      .filter(keep),
  };
}

function inputFor(kind: ReleaseItemKind, id: string): AddReleaseItemInput {
  if (kind === RELEASE_ITEM_KIND.TASK) {
    return { kind, taskId: id };
  }
  return kind === RELEASE_ITEM_KIND.TICKET ? { kind, ticketId: id } : { kind, changeRequestId: id };
}

/** Add one task, ticket or change request to a draft release. */
export function AddReleaseItemModal({
  release,
  onClose,
}: {
  release: ReleaseDetail;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<ReleaseItemKind>(RELEASE_ITEM_KIND.TASK);
  const [id, setId] = useState('');
  const { addItem } = useReleaseMutations();
  const { error, wrap } = useSubmitHandler(onClose);
  const { loading, choices } = useChoices(kind, release);

  return (
    <Modal
      open
      title="Add work to this release"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={addItem.isPending}
            disabled={!id}
            disabledReason="Choose what is going out"
            onClick={() =>
              void wrap(() => addItem.mutateAsync({ id: release.id, input: inputFor(kind, id) }))()
            }
          >
            Add
          </Button>
        </>
      }
    >
      <FormGrid>
        <FormField label="Kind">
          <Select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as ReleaseItemKind);
              setId('');
            }}
            options={KINDS.map((value) => ({ value, label: ITEM_KIND_LABELS[value] }))}
          />
        </FormField>
        <FormField
          label={`${ITEM_KIND_LABELS[kind]} on ${release.projectName}`}
          required
          hint={loading ? 'Loading…' : undefined}
        >
          <Select
            value={id}
            placeholder={choices.length === 0 ? 'Nothing left to add' : 'Choose one'}
            disabled={loading || choices.length === 0}
            onChange={(event) => setId(event.target.value)}
            options={choices.map((choice) => ({ value: choice.id, label: choice.label }))}
          />
        </FormField>
      </FormGrid>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
