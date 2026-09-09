import type { ReleaseNoteDetail } from '@ashniva/types';
import { Card } from '@ashniva/ui';

/**
 * What the client will read.
 *
 * Built from the same two rules the portal mapper applies — items flagged not client-visible are
 * dropped, and `clientLabel` wins over `label` — so a reviewer sees the document before it goes
 * out rather than guessing.
 */
export function ReleaseNotePreview({ note }: { note: ReleaseNoteDetail }) {
  const visible = note.items.filter((item) => item.clientVisible);

  return (
    <Card title="Client preview">
      <div className="release-note-preview">
        <h4>{note.version}</h4>
        {note.clientSummary ? <p>{note.clientSummary}</p> : null}
        {visible.length === 0 ? (
          <p className="muted">
            Nothing here yet — a note with no client-visible line cannot be published.
          </p>
        ) : (
          <ul>
            {visible.map((item) => (
              <li key={item.id}>{item.clientLabel ?? item.label}</li>
            ))}
          </ul>
        )}
        {note.items.length > visible.length ? (
          <p className="muted">
            {note.items.length - visible.length} internal line(s) are hidden from this view.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
