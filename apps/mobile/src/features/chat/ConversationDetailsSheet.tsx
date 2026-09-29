import {
  CONVERSATION_KIND,
  CONVERSATION_MEMBERSHIP,
  membershipOf,
  type ConversationDetail,
} from '@ashniva/types';
import { View } from 'react-native';

import type { IconName } from '../../shared/components/Icon';
import { NavigationRow } from '../../shared/components/navigation-list';
import { AppText } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { PersonAvatar } from '../../shared/components/PersonAvatar';
import { GroupMembers } from './GroupMembers';

/** Where the details can send somebody next. Each is optional: absent, the row is not drawn. */
export interface ConversationDestinations {
  onOpenProject?: ((projectId: string) => void) | undefined;
  onOpenTask?: ((taskId: string) => void) | undefined;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
}

/**
 * Who is in this conversation, and what it hangs off — the web's details drawer, as a sheet.
 *
 * What it shows depends on how the conversation decides its membership, because the three
 * answers are genuinely different things:
 *
 *  * a **group** lists its members, read-only;
 *  * a **pair** has one other person and nothing to administer;
 *  * a **derived** thread has no member list at all. The rows the API returns for it are read
 *    cursors, not a roster, so listing them as "members" would name whoever happened to open the
 *    thread and omit everybody on the project who has not.
 */
export function ConversationDetailsSheet({
  conversation,
  onClose,
  destinations,
}: {
  conversation: ConversationDetail;
  onClose: () => void;
  destinations: ConversationDestinations;
}) {
  const theme = useTheme();
  const membership = membershipOf(conversation.kind);
  const links = anchorLinks(conversation, destinations, onClose);

  return (
    <Sheet visible title="Conversation details" onClose={onClose}>
      <View style={{ gap: theme.spacing.md }}>
        {conversation.kind === CONVERSATION_KIND.GROUP ? (
          <GroupMembers participants={conversation.participants} />
        ) : null}

        {membership === CONVERSATION_MEMBERSHIP.PAIR ? (
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
            <PersonAvatar
              person={conversation.counterpart}
              name={conversation.counterpart?.name ?? 'Somebody'}
              size={36}
            />
            <View style={{ flex: 1, gap: 1 }}>
              <AppText weight="medium">{conversation.counterpart?.name ?? 'Somebody'}</AppText>
              {conversation.counterpart?.email ? (
                <AppText size="xs" tone="muted">
                  {conversation.counterpart.email}
                </AppText>
              ) : null}
            </View>
          </View>
        ) : null}

        {membership === CONVERSATION_MEMBERSHIP.DERIVED ? (
          <AppText tone="muted" size="sm">
            Everybody the project admits can read this thread. There is no list to add somebody to —
            membership follows the project, and the server re-checks it on every request.
          </AppText>
        ) : null}

        {links.map((link) => (
          <NavigationRow
            key={link.label}
            label={link.label}
            description={link.description}
            icon={link.icon}
            onPress={link.onPress}
          />
        ))}

        <AppText size="xs" tone="faint">
          Started {formatDateTime(conversation.createdAt) ?? ''}
        </AppText>
      </View>
    </Sheet>
  );
}

interface AnchorLink {
  label: string;
  description: string;
  icon: IconName;
  onPress: () => void;
}

/** The project, task and ticket this thread is about, where the caller can open them. */
function anchorLinks(
  conversation: ConversationDetail,
  destinations: ConversationDestinations,
  close: () => void,
): AnchorLink[] {
  const links: AnchorLink[] = [];
  const { project, task, ticket } = conversation;
  const { onOpenProject, onOpenTask, onOpenTicket } = destinations;
  if (task && onOpenTask) {
    links.push({
      label: `${task.key} · ${task.title}`,
      description: 'Open the task',
      icon: 'checkbox-outline',
      onPress: () => {
        close();
        onOpenTask(task.id);
      },
    });
  }
  if (ticket && onOpenTicket) {
    links.push({
      label: `${ticket.key} · ${ticket.title}`,
      description: 'Open the ticket',
      icon: 'ticket-outline',
      onPress: () => {
        close();
        onOpenTicket(ticket.id);
      },
    });
  }
  if (project && onOpenProject) {
    links.push({
      label: `${project.code} · ${project.name}`,
      description: 'Open the project',
      icon: 'folder-open-outline',
      onPress: () => {
        close();
        onOpenProject(project.id);
      },
    });
  }
  return links;
}
