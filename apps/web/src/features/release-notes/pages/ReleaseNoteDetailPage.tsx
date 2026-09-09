import { PERMISSIONS, RELEASE_NOTE_STATUS_LABELS, type ReleaseNoteDetail } from '@ashniva/types';
import { Badge, Button, Card, PageHeader } from '@ashniva/ui';
import { useState } from 'react';
import { useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { ReleaseNoteStatusPill } from '../../../shared/components/StatusPills';
import { formatDate, formatDateTime } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { useReleaseNoteMutations, useReleaseNoteQuery } from '../api';
import { AddReleaseNoteItemModal } from '../components/AddReleaseNoteItemModal';
import { ReleaseNoteActions } from '../components/ReleaseNoteActions';
import { ReleaseNoteFormModal } from '../components/ReleaseNoteFormModal';
import { ReleaseNoteItems } from '../components/ReleaseNoteItems';
import { ReleaseNotePreview } from '../components/ReleaseNotePreview';

import '../release-notes.css';

/** Editor, review screen and approval history for one release note. */
export function ReleaseNoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useReleaseNoteQuery(id);

  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <Loaded note={query.data} /> : null}
    </QueryState>
  );
}

function Loaded({ note }: { note: ReleaseNoteDetail }) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const canWrite = usePermission(PERMISSIONS.RELEASE_NOTE_WRITE);
  const { generate } = useReleaseNoteMutations(note.id);

  // The same rule the API enforces: only a draft or a note sent back may be changed.
  const editable = note.status === 'DRAFT' || note.status === 'CHANGES_REQUESTED';
  const mayEdit = canWrite && editable;

  return (
    <div className="release-note-page">
      <PageHeader
        title={`${note.projectCode} ${note.version}`}
        subtitle={`Released ${formatDate(note.releaseDate)}`}
        actions={<ReleaseNoteActions note={note} />}
      >
        <ReleaseNoteStatusPill status={note.status} />
      </PageHeader>

      {note.status === 'CHANGES_REQUESTED' && note.history[0]?.note ? (
        <Card title="Changes requested">
          <p>{note.history[0].note}</p>
          <p className="muted">
            {note.history[0].changedByName} · {formatDateTime(note.history[0].createdAt)}
          </p>
        </Card>
      ) : null}

      <div className="release-note-page__columns">
        <div className="release-note-page__main">
          {mayEdit ? (
            <div className="detail-actions">
              <Button onClick={() => setEditing(true)}>Edit details</Button>
              <Button
                loading={generate.isPending}
                onClick={() => void generate.mutateAsync({})}
                title="Adds anything completed since the last published note; existing lines are left alone"
              >
                Generate from completed work
              </Button>
              <Button onClick={() => setAdding(true)}>Add a line</Button>
            </div>
          ) : null}

          <ReleaseNoteItems note={note} editable={mayEdit} />

          <Card title="Summary for the client">
            {note.clientSummary ? (
              <p>{note.clientSummary}</p>
            ) : (
              <p className="muted">No summary yet.</p>
            )}
          </Card>

          <Card
            title="Internal notes"
            headerAddon={<Badge tone="warning">Never shown to the client</Badge>}
          >
            {note.internalNotes ? (
              <p>{note.internalNotes}</p>
            ) : (
              <p className="muted">Nothing recorded.</p>
            )}
          </Card>
        </div>

        <div className="release-note-page__aside">
          <ReleaseNotePreview note={note} />

          <Card title="Approval history">
            {note.history.length === 0 ? (
              <p className="muted">Not yet submitted.</p>
            ) : (
              <ol className="release-note-history">
                {note.history.map((entry) => (
                  <li key={entry.id}>
                    <strong>{RELEASE_NOTE_STATUS_LABELS[entry.toStatus]}</strong>
                    <span className="muted">
                      {entry.changedByName} · {formatDateTime(entry.createdAt)}
                    </span>
                    {entry.note ? <p>{entry.note}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Reporting period">
            <p className="muted">
              {note.periodStart && note.periodEnd
                ? `${formatDate(note.periodStart)} to ${formatDate(note.periodEnd)}`
                : 'Set when the note is generated.'}
            </p>
            {note.generatedAt ? (
              <p className="muted">Last generated {formatDateTime(note.generatedAt)}</p>
            ) : null}
          </Card>
        </div>
      </div>

      {editing ? (
        <ReleaseNoteFormModal
          existing={{
            id: note.id,
            version: note.version,
            releaseDate: note.releaseDate,
            clientSummary: note.clientSummary,
            internalNotes: note.internalNotes,
          }}
          onClose={() => setEditing(false)}
        />
      ) : null}
      {adding ? (
        <AddReleaseNoteItemModal releaseNoteId={note.id} onClose={() => setAdding(false)} />
      ) : null}
    </div>
  );
}
