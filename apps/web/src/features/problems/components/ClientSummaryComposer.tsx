import { PERMISSIONS, type IncidentDetail } from '@ashniva/types';
import { Alert, Button, Card, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { useIncidentMutations } from '../incident-api';

import '../problems.css';

/**
 * What clients may be told about an incident.
 *
 * Everything else on the incident screen is internal, so this box is marked as loudly as the
 * approved design marks it: saving stores a draft that reaches nobody, and publishing is a
 * separate press that records who did it, when, and the exact wording. Nothing generates this
 * text and nothing publishes it on somebody's behalf.
 */
export function ClientSummaryComposer({ incident }: { incident: IncidentDetail }) {
  const canManage = usePermission(PERMISSIONS.INCIDENT_MANAGE);
  const [text, setText] = useState(incident.clientSummary ?? '');
  const [error, setError] = useState<string | null>(null);
  const { update, publishClientSummary } = useIncidentMutations();
  const published = incident.clientSummaryPublishedAt;

  const run = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <Card title="Client summary">
      <div className="client-summary">
        <span className="client-summary__label">Client-visible when published</span>
        <p className="muted">
          {published
            ? `Published ${formatDateTime(published)}. Editing it here does not republish it.`
            : 'Saved here it reaches nobody. Publishing is what tells the clients on this project.'}
        </p>
        <Textarea
          rows={4}
          value={text}
          disabled={!canManage}
          aria-label="What clients may be told"
          onChange={(event) => setText(event.target.value)}
        />
        <div className="problem-actions">
          <Button
            loading={update.isPending}
            disabled={!canManage}
            disabledReason="Editing an incident needs the incident:manage permission"
            onClick={() =>
              void run(() =>
                update.mutateAsync({ id: incident.id, input: { clientSummary: text } }),
              )
            }
          >
            Save draft
          </Button>
          <Button
            variant="danger"
            loading={publishClientSummary.isPending}
            disabled={!canManage || text.trim().length < 3}
            disabledReason={
              canManage
                ? 'Write the summary before publishing it'
                : 'Publishing needs the incident:manage permission'
            }
            onClick={() =>
              void run(() =>
                publishClientSummary.mutateAsync({ id: incident.id, clientSummary: text }),
              )
            }
          >
            {published ? 'Publish the update' : 'Publish to clients'}
          </Button>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Card>
  );
}
