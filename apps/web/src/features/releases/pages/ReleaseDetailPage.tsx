import {
  PERMISSIONS,
  RELEASE_STATUS,
  RELEASE_STATUS_LABELS,
  TESTING_ASSIGNMENT_KIND,
  type ReleaseDetail,
} from '@ashniva/types';
import { Badge, Button, Card, DescriptionList, PageHeader, StatusPill } from '@ashniva/ui';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDateTime } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { useReleaseQuery } from '../api';
import { ApprovalsList } from '../components/ApprovalsList';
import { ChecksSummary } from '../components/ChecksSummary';
import { IncludedWorkTable } from '../components/IncludedWorkTable';
import { ReleaseActions } from '../components/ReleaseActions';
import { ReleaseEditModal } from '../components/ReleaseEditModal';
import { ReleasePolicyCard } from '../components/ReleasePolicyCard';
import { ClientSignOffCard } from '../../uat/components/ClientSignOffCard';
import { SendToTestingButton } from '../../qa/components/SendToTestingButton';
import { ENVIRONMENT_LABELS, isDraft, releaseTone } from '../release-display';

import '../../dashboard/dashboard.css';
import '../releases.css';

/**
 * One release: what is going out, who has to agree, what must be true first, and what happened
 * (design reference 2s).
 *
 * Everything on this screen that decides whether the release may ship comes from the server's
 * readiness checklist. The page prints it; it never works it out again.
 */
export function ReleaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useReleaseQuery(id);

  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <Loaded release={query.data} /> : null}
    </QueryState>
  );
}

function Loaded({ release }: { release: ReleaseDetail }) {
  const [editing, setEditing] = useState(false);
  const canManage = usePermission(PERMISSIONS.RELEASE_MANAGE);
  const mayEdit = canManage && isDraft(release.status);
  const isPublished = release.status === RELEASE_STATUS.PUBLISHED;
  const testingSubject = {
    projectId: release.projectId,
    releaseId: release.id,
    label: release.version,
    whatToTest: `${release.version} — ${release.title}`,
  };

  return (
    <div className="release-page">
      <PageHeader
        crumbs={
          <>
            <Link to="/releases">Releases</Link> / {release.version}
          </>
        }
        title={`${release.version} — ${release.title}`}
        subtitle={
          <span className="release-page__header-facts">
            <StatusPill
              tone={releaseTone(release.status)}
              label={RELEASE_STATUS_LABELS[release.status]}
            />
            <span>{release.projectName}</span>
            <Badge tone="neutral">{ENVIRONMENT_LABELS[release.environment]}</Badge>
            <span className="muted">· internal — clients see the release note, not this</span>
          </span>
        }
        actions={
          <>
            {mayEdit ? <Button onClick={() => setEditing(true)}>Edit details</Button> : null}
            {/*
              The QA gate counts assignments on the release itself as well as on its items, so a
              release-wide check is a real thing to ask for — and until something called
              `POST /qa/assignments`, a project gating on QA could never satisfy it.

              Once the release is out, the thing to ask for is the other kind. `verify-live` is
              refused until a LIVE_VERIFICATION assignment on this release has passed, and
              `requiresLiveVerification` defaults on, so without this button "Verify live" simply
              answered 409 for ever on every default project.
            */}
            <SendToTestingButton
              subject={testingSubject}
              {...(isPublished
                ? { kind: TESTING_ASSIGNMENT_KIND.LIVE_VERIFICATION, label: 'Send for live check' }
                : {})}
            />
            <ReleaseActions release={release} />
          </>
        }
      />

      {release.failureReason ? (
        <Card title="The publish failed" headerAddon={<Badge tone="danger">Failed</Badge>}>
          <p>{release.failureReason}</p>
          <p className="muted">
            Reopening it returns the release to draft; the sign-offs are collected again, because
            what they covered is about to change.
          </p>
        </Card>
      ) : null}

      {release.rolledBackAt ? (
        <Card title="Rolled back" headerAddon={<Badge tone="danger">Pulled</Badge>}>
          <p>{release.rollbackReason ?? 'No reason was recorded.'}</p>
          <p className="muted">{formatDateTime(release.rolledBackAt)}</p>
        </Card>
      ) : null}

      <div className="release-page__columns">
        <div className="release-page__main">
          <ChecksSummary readiness={release.readiness} />
          <IncludedWorkTable release={release} canManage={canManage} />
          <Card
            title="Release notes"
            headerAddon={<Badge tone="warning">Internal — never shown to the client</Badge>}
          >
            {release.notes ? (
              <p className="prose">{release.notes}</p>
            ) : (
              <p className="muted">The plan for this release has not been written down.</p>
            )}
            {release.releaseNoteId ? (
              <p>
                <Link to={`/release-notes/${release.releaseNoteId}`}>
                  Open the client release note
                </Link>
              </p>
            ) : null}
          </Card>
        </div>

        <div className="release-page__aside">
          <Timeline release={release} />
          <ApprovalsList release={release} />
          <ClientSignOffCard release={release} canManage={canManage} />
          {/*
            The gates are on the release page rather than only in project settings because this is
            where somebody reads that a gate is blocking them, and where they can see what turning
            it off would mean. Both defaults are on, so a project that does not want them has to be
            able to say so somewhere.
          */}
          <ReleasePolicyCard projectId={release.projectId} />
          <History release={release} />
        </div>
      </div>

      {editing ? <ReleaseEditModal release={release} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}

/** The dates that say where the release got to, and who took it there. */
function Timeline({ release }: { release: ReleaseDetail }) {
  return (
    <Card title="Timeline">
      <DescriptionList
        items={[
          {
            key: 'scheduled',
            term: 'Scheduled',
            description: release.scheduledFor ? formatDateTime(release.scheduledFor) : '—',
          },
          {
            key: 'published',
            term: 'Published',
            description: release.publishedAt ? formatDateTime(release.publishedAt) : '—',
          },
          {
            key: 'published-by',
            term: 'Published by',
            description: release.publishedByName ?? '—',
          },
          {
            key: 'verified-live',
            term: 'Verified live',
            description: release.verifiedAt ? formatDateTime(release.verifiedAt) : '—',
          },
          {
            key: 'rolled-back',
            term: 'Rolled back',
            description: release.rolledBackAt ? formatDateTime(release.rolledBackAt) : '—',
          },
          { key: 'created', term: 'Created', description: formatDateTime(release.createdAt) },
        ]}
      />
    </Card>
  );
}

/** Every status this release has been through, in the order it happened. */
function History({ release }: { release: ReleaseDetail }) {
  return (
    <Card title="History">
      {release.history.length === 0 ? (
        <p className="muted">Nothing has happened to this release yet.</p>
      ) : (
        <ol className="release-history">
          {release.history.map((entry) => (
            <li key={entry.id}>
              <strong>
                {entry.fromStatus ? `${RELEASE_STATUS_LABELS[entry.fromStatus]} → ` : ''}
                {RELEASE_STATUS_LABELS[entry.toStatus]}
              </strong>
              <span className="muted">
                {entry.changedByName} · {formatDateTime(entry.createdAt)}
              </span>
              {entry.note ? <p>{entry.note}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
