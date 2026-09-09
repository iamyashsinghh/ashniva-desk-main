import { useFileObjectUrl } from '../../files/api';

export interface ConversationAvatarProps {
  name: string;
  /** A group's picture, when it has one. Null everywhere else. */
  imageFileId: string | null;
  size?: 'sm' | 'md';
}

/**
 * A picture for a conversation, or the initials that stand in for one.
 *
 * Local to this feature rather than in `packages/ui` on purpose: the shared package has gained an
 * `Avatar` on the design-system branch, and this one exists only because this branch is not
 * stacked on it. Swapping it out is a rename, and the PR body says so.
 *
 * `aria-hidden`, because the name is always written next to it. An avatar that announces the same
 * name a second time makes a member list read twice as long to somebody using a screen reader.
 */
export function ConversationAvatar({ name, imageFileId, size = 'sm' }: ConversationAvatarProps) {
  const url = useFileObjectUrl(imageFileId);
  return (
    <span className={`chat-avatar chat-avatar--${size}`} aria-hidden="true">
      {url ? <img src={url} alt="" /> : initials(name)}
    </span>
  );
}

/** At most two letters, from the first and last word of a name. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '?';
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}
