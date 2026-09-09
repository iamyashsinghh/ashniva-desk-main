import {
  WORK_RELATION_TYPE,
  WORK_RELATION_TYPE_LABELS,
  type TicketRelationCandidate,
  type WorkRelationType,
} from '@ashniva/types';
import { Button, FormField, Input, Modal, SegmentedControl, Switch } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useTicketRelationCandidatesQuery, useTicketRelationMutations } from '../api';

import '../relations.css';

/**
 * Linking a ticket to another one.
 *
 * The likely duplicates come first and are the point: somebody who has just read a ticket should
 * not have to go and find its twin by searching. They are the same ranking the "Similar issues"
 * panel shows, with the reasons attached, so a person can see *why* a suggestion appeared before
 * acting on it. Pasting an id is the fallback for the pair the matcher cannot see.
 */
export function LinkTicketModal({
  open,
  ticketId,
  onClose,
}: {
  open: boolean;
  ticketId: string;
  onClose: () => void;
}) {
  const [type, setType] = useState<WorkRelationType>(WORK_RELATION_TYPE.DUPLICATE_OF);
  const [targetTicketId, setTargetTicketId] = useState('');
  const [note, setNote] = useState('');
  const [closeDuplicate, setCloseDuplicate] = useState(true);
  const candidates = useTicketRelationCandidatesQuery(ticketId, open);
  const { link } = useTicketRelationMutations(ticketId);
  const { error, wrap } = useSubmitHandler(() => {
    setTargetTicketId('');
    setNote('');
    onClose();
  });

  const duplicate = type === WORK_RELATION_TYPE.DUPLICATE_OF;
  return (
    <Modal
      open={open}
      title="Link this ticket"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={link.isPending}
            disabled={!targetTicketId}
            disabledReason="Choose a ticket to link to"
            onClick={() =>
              void wrap(() =>
                link.mutateAsync({
                  type,
                  targetTicketId,
                  note: note || undefined,
                  closeDuplicate: duplicate ? closeDuplicate : undefined,
                }),
              )()
            }
          >
            {duplicate ? 'Mark as duplicate' : 'Link'}
          </Button>
        </>
      }
    >
      <div className="segmented-field">
        <span className="segmented-field__label">Relationship</span>
        <SegmentedControl
          aria-label="Relationship"
          size="sm"
          value={type}
          onChange={setType}
          options={Object.values(WORK_RELATION_TYPE).map((value) => ({
            key: value,
            label: WORK_RELATION_TYPE_LABELS[value],
          }))}
        />
      </div>

      <Candidates
        candidates={candidates.data?.candidates ?? []}
        loading={candidates.isLoading}
        selected={targetTicketId}
        onSelect={setTargetTicketId}
      />

      <FormField
        label="Or paste a ticket id"
        hint="The id from the ticket’s address bar, when the suggestions do not have it."
      >
        <Input
          value={targetTicketId}
          onChange={(event) => setTargetTicketId(event.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
        />
      </FormField>

      <FormField label="Note (optional)" hint="Internal. The client never reads it.">
        <Input value={note} onChange={(event) => setNote(event.target.value)} />
      </FormField>

      {duplicate ? (
        <Switch
          checked={closeDuplicate}
          onChange={setCloseDuplicate}
          label="Close this ticket as a duplicate"
          description="Nothing is merged: both tickets keep their replies, attachments, SLA record and history."
        />
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

function Candidates({
  candidates,
  loading,
  selected,
  onSelect,
}: {
  candidates: TicketRelationCandidate[];
  loading: boolean;
  selected: string;
  onSelect: (ticketId: string) => void;
}) {
  if (loading) {
    return <p className="relations-panel__meta">Looking for likely duplicates…</p>;
  }
  if (candidates.length === 0) {
    return <p className="relations-panel__meta">No likely duplicates found.</p>;
  }
  return (
    <ul className="relations-candidates">
      {candidates.map((candidate) => (
        <li key={candidate.ticketId}>
          <button
            type="button"
            className={`relations-candidates__option${
              selected === candidate.ticketId ? ' relations-candidates__option--selected' : ''
            }`}
            disabled={candidate.alreadyLinked}
            onClick={() => onSelect(candidate.ticketId)}
          >
            <span className="relations-candidates__key">{candidate.key}</span>
            <span>{candidate.title}</span>
            <span className="relations-panel__meta">
              {candidate.clientOrganizationName}
              {candidate.signals.length > 0 ? ` · ${candidate.signals.join(' · ')}` : ''}
              {candidate.alreadyLinked ? ' · already linked' : ''}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
