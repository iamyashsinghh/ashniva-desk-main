import { PERMISSIONS, type ConversationSummary } from '@ashniva/types';
import { Button } from '@ashniva/ui';
import { useState } from 'react';

import { usePermission, useCurrentUser } from '../../auth/session-context';
import { useConversationsQuery } from '../api';
import { isGroupOnlyInboxKind, isPeopleInboxKind, inboxAllowsPersonalChat } from '../conversation-filters';
import { useMentionedConversationIds } from '../mention-badges';
import { useMessenger } from '../messenger-context';
import { ConversationAvatar } from './ConversationAvatar';
import { ConversationListPanel } from './ConversationListPanel';
import { ConversationView } from './ConversationPanel';
import { NewConversation } from './NewConversation';

import '../communication.css';

/**
 * Facebook-style messenger in the bottom-right corner: a bubble with the unread total, an inbox
 * popover, and one chat popup that can be minimized.
 *
 * Mounted in the shell so it survives navigation. Hidden for people who cannot participate in
 * internal conversations (clients on the portal).
 */
export function MessengerDock() {
  const canChat = usePermission(PERMISSIONS.CONVERSATION_PARTICIPATE);
  const personalChat = inboxAllowsPersonalChat(useCurrentUser());
  const messenger = useMessenger();
  const mentioned = useMentionedConversationIds();
  const conversations = useConversationsQuery({ limit: 100 });
  const [starting, setStarting] = useState(false);

  if (!canChat || !messenger) {
    return null;
  }

  const unread = (conversations.data ?? [])
    .filter((row) => (personalChat ? isPeopleInboxKind(row.kind) : isGroupOnlyInboxKind(row.kind)))
    .reduce((total, row) => total + row.unreadCount, 0);
  const openRow = (conversations.data ?? []).find((row) => row.id === messenger.conversationId);
  const classes = [
    'messenger-dock',
    messenger.inboxOpen ? 'messenger-dock--open' : '',
    messenger.conversationId && !messenger.minimized ? 'messenger-dock--chat-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      {messenger.conversationId && messenger.minimized ? (
        <MinimizedChat
          row={openRow}
          onRestore={messenger.restoreConversation}
          onClose={messenger.closeConversation}
        />
      ) : null}

      {messenger.conversationId && !messenger.minimized ? (
        <section className="messenger-dock__chat" aria-label="Open conversation">
          <ConversationView
            key={messenger.conversationId}
            conversationId={messenger.conversationId}
            kind={openRow?.kind ?? messenger.conversationKind}
            compact
            onMinimize={messenger.minimizeConversation}
            onClose={messenger.closeConversation}
            onLeave={messenger.closeConversation}
          />
        </section>
      ) : null}

      {messenger.inboxOpen ? (
        <section className="messenger-dock__inbox" aria-label="Chats">
          <header className="messenger-dock__inbox-head">
            <h2 className="messenger-dock__title">Chats</h2>
            <div className="messenger-dock__inbox-actions">
              {personalChat ? (
                <Button variant="ghost" size="sm" onClick={() => setStarting(true)}>
                  New
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label="Close chats"
                onClick={messenger.closeInbox}
              >
                ×
              </Button>
            </div>
          </header>
          <ConversationListPanel
            compact
            mentioned={mentioned}
            {...(messenger.conversationId ? { selectedId: messenger.conversationId } : {})}
            onSelect={(row) => messenger.openConversation(row.id, row.kind)}
          />
        </section>
      ) : null}

      <button
        type="button"
        className="messenger-dock__bubble"
        aria-label={unreadLabel(unread)}
        aria-expanded={messenger.inboxOpen}
        onClick={messenger.toggleInbox}
      >
        <MessengerIcon />
        {unread > 0 ? (
          <span className="messenger-dock__badge" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {personalChat ? (
        <NewConversation
          open={starting}
          onClose={() => setStarting(false)}
          onOpened={(id) => messenger.openConversation(id)}
        />
      ) : null}
    </div>
  );
}

function MinimizedChat({
  row,
  onRestore,
  onClose,
}: {
  row: ConversationSummary | undefined;
  onRestore: () => void;
  onClose: () => void;
}) {
  const name = row?.counterpart?.name ?? row?.title ?? 'Chat';
  return (
    <div className="messenger-dock__bar">
      <button type="button" className="messenger-dock__bar-open" onClick={onRestore}>
        <ConversationAvatar name={name} imageFileId={row?.imageFileId ?? null} size="sm" />
        <span className="messenger-dock__bar-name">{name}</span>
        {row && row.unreadCount > 0 ? (
          <span className="messenger-dock__badge" aria-label={`${row.unreadCount} unread`}>
            {row.unreadCount > 99 ? '99+' : row.unreadCount}
          </span>
        ) : null}
      </button>
      <Button variant="ghost" size="sm" iconOnly aria-label="Close conversation" onClick={onClose}>
        ×
      </Button>
    </div>
  );
}

function unreadLabel(unread: number): string {
  if (unread <= 0) {
    return 'Messages';
  }
  if (unread === 1) {
    return 'Messages, 1 unread';
  }
  return `Messages, ${unread} unread`;
}

function MessengerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.5 2 2 6.04 2 11.5c0 2.89 1.4 5.46 3.6 7.19v2.76c0 .192.168.1.5.8.14.05.28.07.42.07.2 0 .4-.07.55-.2l2.6-2.2c.85.23 1.76.36 2.7.36 5.5 0 10-4.04 10-9.5S17.5 2 12 2Zm5.08 8.05-2.55 4.05a.85.85 0 0 1-1.22.21l-2.5-1.87a.32.32 0 0 0-.38 0l-3.38 2.54c-.46.34-1.07-.19-.77-.67l2.55-4.05a.85.85 0 0 1 1.22-.21l2.5 1.87c.11.08.27.08.38 0l3.38-2.54c.46-.34 1.07.19.77.67Z"
      />
    </svg>
  );
}
