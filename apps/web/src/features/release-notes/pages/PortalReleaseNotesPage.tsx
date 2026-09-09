import { RELEASE_NOTE_ITEM_KIND_LABELS } from '@ashniva/types';
import { Badge, Button, Card, EmptyState, PageHeader } from '@ashniva/ui';
import { useState } from 'react';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDate } from '../../../shared/lib/format';
import { usePortalReleaseNoteQuery, usePortalReleaseNotesQuery } from '../api';

import '../release-notes.css';

/**
 * Release notes as a client reads them.
 *
 * Every note reachable here is published; the API has no route that would return a draft to a
 * client, so there is no status to show or filter by.
 */
export function PortalReleaseNotesPage() {
  const list = usePortalReleaseNotesQuery();
  const [selected, setSelected] = useState<string | null>(null);
  const detail = usePortalReleaseNoteQuery(selected ?? undefined);

  return (
    <div className="release-note-page">
      <PageHeader title="Releases" subtitle="What has been delivered to you, release by release" />

      <QueryState
        isLoading={list.isLoading}
        isError={list.isError}
        error={list.error}
        onRetry={() => void list.refetch()}
      >
        {list.data && list.data.items.length === 0 ? (
          <EmptyState
            title="No releases yet"
            description="Release notes appear here once a release has been published to you."
          />
        ) : null}

        <div className="release-note-page__columns">
          <div className="release-note-page__main">
            {(list.data?.items ?? []).map((note) => (
              <Card
                key={note.id}
                title={note.version}
                headerAddon={
                  <Button
                    size="sm"
                    variant={selected === note.id ? 'primary' : undefined}
                    onClick={() => setSelected(note.id)}
                  >
                    {selected === note.id ? 'Showing' : 'Read'}
                  </Button>
                }
              >
                <p className="muted">Released {formatDate(note.releaseDate)}</p>
              </Card>
            ))}
          </div>

          <div className="release-note-page__aside">
            <QueryState
              isLoading={detail.isLoading && Boolean(selected)}
              isError={detail.isError}
              error={detail.error}
              onRetry={() => void detail.refetch()}
            >
              {detail.data ? (
                <Card title={`Release ${detail.data.version}`}>
                  {detail.data.summary ? <p>{detail.data.summary}</p> : null}
                  <ul className="release-note-preview">
                    {detail.data.items.map((item, index) => (
                      <li key={`${item.kind}-${index}`}>
                        {item.label}{' '}
                        <Badge tone="neutral">{RELEASE_NOTE_ITEM_KIND_LABELS[item.kind]}</Badge>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : (
                <Card title="Release details">
                  <p className="muted">Pick a release to read what it included.</p>
                </Card>
              )}
            </QueryState>
          </div>
        </div>
      </QueryState>
    </div>
  );
}
