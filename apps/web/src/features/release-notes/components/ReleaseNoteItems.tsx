import {
  RELEASE_NOTE_ITEM_KIND_LABELS,
  type ReleaseNoteDetail,
  type ReleaseNoteItemSummary,
} from '@ashniva/types';
import { Badge, Button, Card } from '@ashniva/ui';

import { useReleaseNoteMutations } from '../api';

interface ReleaseNoteItemsProps {
  note: ReleaseNoteDetail;
  editable: boolean;
}

/**
 * The lines on the note, in the order a client will read them.
 *
 * A line the client cannot see is still shown here, marked — an editor needs to know it is on the
 * note. The published view drops it.
 */
export function ReleaseNoteItems({ note, editable }: ReleaseNoteItemsProps) {
  const { removeItem, reorder } = useReleaseNoteMutations(note.id);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    const moved = note.items[index];
    const displaced = note.items[target];
    if (!moved || !displaced) {
      return;
    }
    const next = note.items.map((item, position) => {
      if (position === index) {
        return displaced;
      }
      return position === target ? moved : item;
    });
    void reorder.mutateAsync(next.map((item) => item.id));
  };

  if (note.items.length === 0) {
    return (
      <Card title="What is in this release">
        <p className="muted">Nothing yet. Generate from completed work, or add a line by hand.</p>
      </Card>
    );
  }

  return (
    <Card title={`What is in this release (${note.items.length})`}>
      <ul className="release-note-items">
        {note.items.map((item, index) => (
          <li key={item.id} className="release-note-items__row">
            <div className="release-note-items__text">
              <span>{item.clientLabel ?? item.label}</span>
              <span className="release-note-items__meta">
                <Badge tone="neutral">{RELEASE_NOTE_ITEM_KIND_LABELS[item.kind]}</Badge>
                {item.source === 'MANUAL' ? <Badge tone="info">Added by hand</Badge> : null}
                {item.clientVisible ? null : <Badge tone="warning">Internal only</Badge>}
              </span>
            </div>
            {editable ? (
              <div className="release-note-items__actions">
                <Button
                  size="sm"
                  aria-label={`Move “${labelOf(item)}” up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  aria-label={`Move “${labelOf(item)}” down`}
                  disabled={index === note.items.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  aria-label={`Remove “${labelOf(item)}”`}
                  loading={removeItem.isPending}
                  onClick={() => void removeItem.mutateAsync(item.id)}
                >
                  Remove
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function labelOf(item: ReleaseNoteItemSummary): string {
  return item.clientLabel ?? item.label;
}
