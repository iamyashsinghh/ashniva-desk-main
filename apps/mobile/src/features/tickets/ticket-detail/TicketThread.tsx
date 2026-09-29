import {
  PERMISSIONS,
  TICKET_ACTION,
  VISIBILITY,
  type CommentSummary,
  type TicketDetail,
  type Visibility,
} from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../../shared/api/mutations';
import { Section } from '../../../shared/components/layout';
import { Segmented } from '../../../shared/components/navigation-list';
import { usePermission } from '../../auth/SessionProvider';
import { TicketMessages, TicketReplyComposer } from '../TicketConversation';

type Mode = 'public' | 'internal';

/**
 * The conversation on a staff ticket: the public thread the requester reads and, for somebody
 * holding `comment:internal`, the internal notes beside it.
 *
 * The two are separate tabs rather than one interleaved thread, as on the web, and the composer
 * follows the tab: what you are reading is what you are adding to. It opens on the public thread
 * every time, so a note is only ever internal because somebody chose that tab just now. Whether
 * each kind may be sent at all is the API's `reply-public` / `note-internal` answer.
 */
export function TicketThread({ ticket }: { ticket: TicketDetail }) {
  const canInternal = usePermission(PERMISSIONS.COMMENT_INTERNAL);
  const [mode, setMode] = useState<Mode>('public');
  const [body, setBody] = useState('');
  const internal = canInternal && mode === 'internal';

  const send = useApiMutation<{ body: string; visibility: Visibility }, CommentSummary>({
    path: `/tickets/${ticket.id}/comments`,
    body: (variables) => variables,
    invalidate: [['tickets', ticket.id], ['tickets']],
    onSuccess: () => setBody(''),
  });

  const publicReplies = ticket.comments.filter((entry) => entry.visibility === VISIBILITY.CLIENT);
  const notes = ticket.comments.filter((entry) => entry.visibility === VISIBILITY.INTERNAL);
  const shown = internal ? notes : publicReplies;
  const availability = ticket.actions.find(
    (entry) =>
      entry.action === (internal ? TICKET_ACTION.NOTE_INTERNAL : TICKET_ACTION.REPLY_PUBLIC),
  );
  const refusal = availability?.enabled
    ? null
    : (availability?.reason ?? 'You cannot add to this thread.');

  return (
    <Section
      title={internal ? 'Internal notes' : 'Conversation with the requester'}
      count={shown.length}
      icon={internal ? 'lock-closed-outline' : 'chatbubbles-outline'}
    >
      {canInternal ? (
        <Segmented
          label="Thread"
          value={mode}
          onChange={(next) => {
            setMode(next);
            send.reset();
          }}
          options={[
            {
              value: 'public',
              label: `Reply to client (${publicReplies.length})`,
              icon: 'people-outline',
            },
            { value: 'internal', label: `Internal (${notes.length})`, icon: 'lock-closed-outline' },
          ]}
        />
      ) : null}
      <TicketMessages
        comments={shown}
        emptyText={internal ? 'No internal notes yet.' : 'No replies yet.'}
      />
      <TicketReplyComposer
        value={body}
        onChange={setBody}
        busy={send.busy}
        error={send.error}
        internal={internal}
        disabledReason={refusal}
        audienceHint="The requester reads this."
        onSend={() =>
          void send.run({
            body: body.trim(),
            visibility: internal ? VISIBILITY.INTERNAL : VISIBILITY.CLIENT,
          })
        }
      />
    </Section>
  );
}
