import type { ConversationDetail } from '@ashniva/types';
import { Button } from '@ashniva/ui';
import { useState } from 'react';

import { ConversationAvatar } from './ConversationAvatar';
import { GroupMembers } from './GroupMembers';

export interface GroupPanelProps {
  conversation: ConversationDetail;
  /**
   * Whether the body is already open and there is nothing to toggle.
   *
   * True in the details drawer, where the panel *is* the content: a "Group" button that reveals
   * the only thing the drawer was opened for is a press that does nothing worth doing.
   */
  expanded?: boolean;
  /** Kept so the thread can close after a leave; leave is no longer offered. */
  onLeft?: () => void;
}

/**
 * Who is in a group.
 *
 * Membership is managed from the project and its team, not from this panel: there is no leave,
 * remove, or rename here. The list is so somebody can see who will receive the next message.
 */
export function GroupPanel({ conversation, expanded = false }: GroupPanelProps) {
  const [toggled, setToggled] = useState(false);
  const open = expanded || toggled;
  const [error, setError] = useState<string | undefined>();

  return (
    <section className="chat-group">
      <div className="chat-group__bar">
        <ConversationAvatar
          name={conversation.title}
          imageFileId={conversation.imageFileId}
          size="md"
        />
        <span className="chat-group__count">
          {conversation.participants.filter((person) => person.leftAt === null).length} members
        </span>
        {expanded ? null : (
          <Button variant="ghost" size="sm" onClick={() => setToggled(!toggled)}>
            {toggled ? 'Hide group' : 'Group'}
          </Button>
        )}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {open ? (
        <div className="chat-group__body">
          <GroupMembers conversation={conversation} onError={setError} />
        </div>
      ) : null}
    </section>
  );
}
