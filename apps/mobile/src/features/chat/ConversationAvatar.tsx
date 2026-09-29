import { CONVERSATION_KIND, type ConversationSummary } from '@ashniva/types';
import { useState } from 'react';
import { Image } from 'react-native';

import { mobileEnv } from '../../config/env';
import { useAccessTokenForImages } from '../../shared/attachments/attachments';
import { IconTile } from '../../shared/components/Icon';
import { PersonAvatar, type AvatarPerson } from '../../shared/components/PersonAvatar';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { CONVERSATION_KIND_ICONS, conversationLabel } from './conversation-filters';

/**
 * The picture for a conversation: the other person's face in a pair, a group's own picture (or
 * its tile), and the kind's mark for a thread that hangs off a project, task or ticket.
 *
 * A group picture is an ordinary file, so it streams through `GET /files/:id/download` with the
 * bearer token like an attachment; one that cannot be fetched draws the group's initials tile.
 */
export function ConversationAvatar({
  conversation,
  person,
  size = 40,
  cutColor,
}: {
  conversation: ConversationSummary;
  /** The other person, when the caller knows it better than the summary's counterpart. */
  person?: AvatarPerson | null;
  size?: number;
  cutColor?: string;
}) {
  const name = conversationLabel(conversation);
  const cut = cutColor !== undefined ? { cutColor } : {};

  switch (conversation.kind) {
    case CONVERSATION_KIND.DIRECT:
    case CONVERSATION_KIND.SCOPE_DIRECT:
      return <PersonAvatar person={person ?? conversation.counterpart} name={name} size={size} />;
    case CONVERSATION_KIND.GROUP:
      return conversation.imageFileId ? (
        <GroupPicture fileId={conversation.imageFileId} name={name} size={size} {...cut} />
      ) : (
        <PersonAvatar name={name} size={size} shape="group" {...cut} />
      );
    default:
      return (
        <IconTile
          name={CONVERSATION_KIND_ICONS[conversation.kind]}
          size={size}
          style={{ borderRadius: size / 2 }}
        />
      );
  }
}

function GroupPicture({
  fileId,
  name,
  size,
  cutColor,
}: {
  fileId: string;
  name: string;
  size: number;
  cutColor?: string;
}) {
  const theme = useTheme();
  const token = useAccessTokenForImages();
  const [failed, setFailed] = useState<string | null>(null);
  const attempt = `${fileId}|${token ?? ''}`;

  if (!token || failed === attempt) {
    return (
      <PersonAvatar
        name={name}
        size={size}
        shape="group"
        {...(cutColor !== undefined ? { cutColor } : {})}
      />
    );
  }
  return (
    <Image
      testID="group-picture"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      source={{
        uri: `${mobileEnv.apiBaseUrl}/files/${encodeURIComponent(fileId)}/download`,
        headers: { Authorization: `Bearer ${token}` },
      }}
      resizeMode="cover"
      onError={() => setFailed(attempt)}
      style={{
        backgroundColor: theme.colors.pillBackground,
        borderRadius: size / 2,
        height: size,
        width: size,
      }}
    />
  );
}
