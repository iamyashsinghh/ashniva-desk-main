import { Toast, ToastStack } from '@ashniva/ui';
import { useNavigate } from 'react-router';

import { formatTime } from '../../../shared/lib/format';
import { useLiveMessageToasts } from '../live-messages';
import { useMessenger } from '../messenger-context';
import { ConversationAvatar } from './ConversationAvatar';

import '../communication.css';

/**
 * The bottom-right stack of arriving messages.
 *
 * Mounted once, in the application shell, so it survives navigation — a card that vanished the
 * moment somebody clicked something else would be no use. Everything about what may be shown is
 * `useLiveMessageToasts`'s business; this file is what it looks like.
 *
 * Clicking opens the conversation *where it lives*: a task discussion goes to the task and a
 * ticket's to the ticket, because that is where the person will want to be — the link is the
 * server's own `conversationLink`, so the corner and the bell menu agree.
 */
export function LiveMessageToasts() {
  const { toasts, dismiss } = useLiveMessageToasts();
  const navigate = useNavigate();
  const messenger = useMessenger();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <ToastStack aria-label="New messages">
      {toasts.map((toast) => (
        <Toast
          key={toast.key}
          dismissLabel={`Dismiss the message from ${toast.from}`}
          leading={
            <ConversationAvatar name={toast.from} imageFileId={toast.imageFileId} size="md" />
          }
          onDismiss={() => dismiss(toast.key)}
          onOpen={() => {
            dismiss(toast.key);
            if (messenger) {
              messenger.openConversation(toast.conversationId);
              return;
            }
            void navigate(toast.link);
          }}
        >
          <span className="chat-toast__head">
            <strong className="chat-toast__from">{toast.from}</strong>
            {/* The dot is the unread mark: the message is unread by definition — nothing here
                moves a read cursor — and a count would be a second, staler copy of the badge. */}
            <span className="chat-toast__unread" aria-label="Unread" />
            <span className="timeline__note">{formatTime(toast.at)}</span>
          </span>
          {toast.context || toast.isMention ? (
            <span className="chat-toast__context">
              {toast.isMention ? <span className="chat-toast__mention">Mentioned you</span> : null}
              {toast.context ? <span className="timeline__note">{toast.context}</span> : null}
            </span>
          ) : null}
          <span className="chat-toast__preview">{toast.preview}</span>
        </Toast>
      ))}
    </ToastStack>
  );
}
