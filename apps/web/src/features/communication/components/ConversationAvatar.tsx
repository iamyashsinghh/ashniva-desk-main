import type { UserRef } from '@ashniva/types';

import { PersonAvatar } from '../../../shared/components/PersonAvatar';
import { useFileObjectUrl } from '../../files/api';

export interface ConversationAvatarProps {
  name: string;
  /** A group's picture, when it has one. Null everywhere else. */
  imageFileId: string | null;
  /** The person a direct conversation or a member row is about, so their own picture is drawn. */
  person?: Pick<UserRef, 'id' | 'avatar'> | null | undefined;
  size?: 'sm' | 'md';
}

/**
 * A picture for a conversation: the group's image, or else the person's own avatar, or else the
 * initials that stand in for either.
 *
 * `aria-hidden`, because the name is always written next to it. An avatar that announces the same
 * name a second time makes a member list read twice as long to somebody using a screen reader.
 */
export function ConversationAvatar({
  name,
  imageFileId,
  person,
  size = 'sm',
}: ConversationAvatarProps) {
  const url = useFileObjectUrl(imageFileId);
  if (url) {
    return (
      <span className={`chat-avatar chat-avatar--${size}`} aria-hidden="true">
        <img src={url} alt="" />
      </span>
    );
  }
  return <PersonAvatar name={name} userId={person?.id} avatar={person?.avatar} size={size} />;
}
