import {
  CONVERSATION_KIND,
  CONVERSATION_MEMBERSHIP,
  membershipOf,
  type ConversationKind,
} from '@ashniva/types';
import { View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { IconTile, type IconName } from '../../shared/components/Icon';
import { AppText, Screen } from '../../shared/components/primitives';
import { ErrorState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * A thread with nothing in it yet, or one that failed to load, or a search that found nothing.
 *
 * The empty thread says who will read the first message — the same sentence the web prints —
 * because in a group that is not obvious: a message that tags somebody is private to them.
 */
export function EmptyThread({
  kind,
  error,
  searching = false,
}: {
  kind: ConversationKind;
  error: unknown;
  searching?: boolean;
}) {
  const theme = useTheme();
  let headline = 'Nothing said yet. The first message is yours.';
  let detail: string | null = audienceSentence(kind);
  let icon: IconName = 'chatbubbles-outline';
  if (error) {
    headline = errorMessage(error);
    detail = null;
    icon = 'alert-circle-outline';
  } else if (searching) {
    headline = 'Nothing loaded matches the search.';
    detail = 'Only the messages already loaded are searched. Scroll up to load earlier ones.';
    icon = 'search-outline';
  }

  return (
    <View
      style={{
        alignItems: 'center',
        flex: 1,
        gap: theme.spacing.md,
        justifyContent: 'center',
        padding: theme.spacing.xl,
      }}
    >
      <IconTile name={icon} tone={error ? 'danger' : 'primary'} size={56} />
      <AppText tone="muted" align="center">
        {headline}
      </AppText>
      {detail ? (
        <AppText size="sm" tone="faint" align="center">
          {detail}
        </AppText>
      ) : null}
    </View>
  );
}

function audienceSentence(kind: ConversationKind): string | null {
  if (kind === CONVERSATION_KIND.GROUP) {
    return 'Everybody in this group reads what is written here. A message that tags somebody is private to them, Super Admins and Project Managers.';
  }
  if (membershipOf(kind) === CONVERSATION_MEMBERSHIP.DERIVED) {
    return 'Everyone on this project can read what is written here.';
  }
  return null;
}

/**
 * The conversation did not load.
 *
 * A 404 gets its own words and no retry. It is the API's deliberate answer to somebody with no
 * relationship to the task or the thread — chosen over a 403 so that a refusal does not confirm a
 * discussion exists — and "try again" would only ask the same question twice.
 */
export function ConversationUnavailable({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const notThere = error instanceof Error && (error as { status?: number }).status === 404;
  if (notThere) {
    return (
      <Screen>
        <ErrorState message="This conversation is not available to you." />
      </Screen>
    );
  }
  return (
    <Screen>
      <ErrorState
        message={errorMessage(error)}
        offline={error instanceof Error && error.name === 'NetworkError'}
        onRetry={onRetry}
      />
    </Screen>
  );
}
