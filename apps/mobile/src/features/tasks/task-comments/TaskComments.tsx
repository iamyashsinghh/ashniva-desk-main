import { VISIBILITY, type CommentSummary, type TaskDetail } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '../../../shared/components/Avatar';
import { Expandable } from '../../../shared/components/Expandable';
import { Section } from '../../../shared/components/layout';
import { Segmented, type SegmentOption } from '../../../shared/components/navigation-list';
import { AppText, Divider, Pill } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { MessageBody } from '../../chat/MessageBody';
import { CommentComposer } from './CommentComposer';
import { filterComments, type CommentFilter } from './comment-visibility';

const FILTERS: readonly SegmentOption<CommentFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'internal', label: 'Internal', icon: 'lock-closed-outline' },
  { value: 'client', label: 'Client', icon: 'eye-outline' },
];

/**
 * The comment thread and the box to add to it.
 *
 * The Internal / Client filter is for staff, who see both kinds; a client only ever receives the
 * client-visible ones from the API, so the filter would have nothing to separate for them.
 */
export function TaskComments({
  task,
  canInternal,
  viewerId,
  onPosted,
}: {
  task: TaskDetail;
  /** `comment:internal` — whether this person may write, and so read, internal notes. */
  canInternal: boolean;
  viewerId: string | null;
  onPosted: () => void;
}) {
  const theme = useTheme();
  const [filter, setFilter] = useState<CommentFilter>('all');
  const shown = filterComments(task.comments, filter);

  return (
    <Section title="Comments" count={task.comments.length} icon="chatbubbles-outline">
      {canInternal && task.comments.length > 0 ? (
        <Segmented options={FILTERS} value={filter} onChange={setFilter} label="Which comments" />
      ) : null}
      {shown.length === 0 ? (
        <AppText size="sm" tone="muted">
          {task.comments.length === 0 ? 'No comments yet.' : 'No comments of this kind.'}
        </AppText>
      ) : (
        <Expandable items={shown} initial={5} noun="comments">
          {(comment, index) => (
            <View key={comment.id} style={{ gap: theme.spacing.xs }}>
              {index > 0 ? <Divider /> : null}
              <CommentRow comment={comment} viewerId={viewerId} />
            </View>
          )}
        </Expandable>
      )}
      <Divider />
      <CommentComposer
        taskId={task.id}
        canInternal={canInternal}
        hasClient={Boolean(task.clientOrganization)}
        onPosted={onPosted}
      />
    </Section>
  );
}

function CommentRow({ comment, viewerId }: { comment: CommentSummary; viewerId: string | null }) {
  const theme = useTheme();
  const names = new Map((comment.mentions ?? []).map((person) => [person.id, person.name]));
  const isClient = comment.visibility === VISIBILITY.CLIENT;
  return (
    <View style={{ gap: theme.spacing.xs, paddingTop: theme.spacing.xs }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
        <Avatar name={comment.author.name} size={28} />
        <View style={{ flex: 1 }}>
          <AppText size="sm" weight="medium" numberOfLines={1}>
            {comment.author.name}
          </AppText>
          <AppText size="xs" tone="faint">
            {formatDateTime(comment.createdAt)}
          </AppText>
        </View>
        <Pill
          label={isClient ? 'Client sees this' : 'Internal'}
          tone={isClient ? 'info' : 'neutral'}
        />
      </View>
      <MessageBody body={comment.body} names={names} viewerId={viewerId} />
    </View>
  );
}
