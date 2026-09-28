import {
  PERMISSIONS,
  TASK_LIST_VIEW,
  TASK_STATUS_LABELS,
  TICKET_STATUS_LABELS,
  type TaskSummary,
  type TicketSummary,
} from '@ashniva/types';
import { View } from 'react-native';

import { usePagedResource } from '../../shared/api/queries';
import { StatTile, TileGrid } from '../../shared/components/data-display';
import { PressableCard, SectionHeader } from '../../shared/components/layout';
import { AppText, Button, Pill, PillRow } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { useInbox } from '../notifications/notifications-api';
import { taskTone, timingPill } from '../tasks/task-display';
import { ticketTone } from '../tickets/ticket-display';
import { PREVIEW_LENGTH as PREVIEW, TileSkeleton } from './HomeDashboard';

/**
 * Home's summary for the people who do the work: unread alerts, what is up next, and the latest
 * tickets — each the first page of the list its own tab loads, under the same query key.
 */

export function InternalSummary({
  onOpenTask,
  onOpenTasks,
  onOpenTicket,
  onOpenTickets,
  onOpenAlerts,
}: {
  onOpenTask?: (id: string) => void;
  onOpenTasks?: () => void;
  onOpenTicket?: (id: string) => void;
  onOpenTickets?: () => void;
  onOpenAlerts?: () => void;
}) {
  const { can } = useSession();
  const showTasks = can(PERMISSIONS.TASK_READ) && Boolean(onOpenTask);
  const showTickets =
    (can(PERMISSIONS.TICKET_READ) || can(PERMISSIONS.TICKET_RAISE)) && Boolean(onOpenTicket);

  return (
    <>
      {onOpenAlerts ? <AlertsTile onOpen={onOpenAlerts} /> : null}
      {showTasks && onOpenTask ? <UpNext onOpen={onOpenTask} onOpenAll={onOpenTasks} /> : null}
      {showTickets && onOpenTicket ? (
        <RecentTickets onOpen={onOpenTicket} onOpenAll={onOpenTickets} />
      ) : null}
    </>
  );
}

function AlertsTile({ onOpen }: { onOpen: () => void }) {
  const inbox = useInbox();
  if (inbox.isLoading || inbox.error) {
    return null;
  }
  return (
    <TileGrid>
      <StatTile
        label="Unread alerts"
        value={inbox.unreadCount}
        caption={inbox.unreadCount > 0 ? 'Waiting for you' : 'You are up to date'}
        tone={inbox.unreadCount > 0 ? 'primary' : 'default'}
        onPress={onOpen}
      />
    </TileGrid>
  );
}

function UpNext({ onOpen, onOpenAll }: { onOpen: (id: string) => void; onOpenAll?: () => void }) {
  const theme = useTheme();
  // The Tasks tab's own query, key for key, so the two share one answer.
  const list = usePagedResource<TaskSummary>(['tasks', TASK_LIST_VIEW.MY], '/tasks', {
    view: TASK_LIST_VIEW.MY,
    limit: 20,
  });
  const tasks = list.items.filter(Boolean).slice(0, PREVIEW);

  if (list.isLoading) {
    return <TileSkeleton />;
  }
  if (list.error || tasks.length === 0) {
    return null;
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <SectionHeader
        title="Up next"
        action={
          onOpenAll ? (
            <Button label="All tasks" variant="ghost" size="sm" onPress={onOpenAll} />
          ) : null
        }
      />
      {tasks.map((task) => {
        const timing = timingPill(task.timing);
        return (
          <PressableCard
            key={task.id}
            accessibilityLabel={`${task.key} ${task.title}`}
            onPress={() => onOpen(task.id)}
          >
            <AppText size="xs" tone="faint" numberOfLines={1}>
              {task.key} · {task.project.name}
            </AppText>
            <AppText weight="medium" numberOfLines={2}>
              {task.title}
            </AppText>
            <PillRow>
              <Pill label={TASK_STATUS_LABELS[task.status]} tone={taskTone(task.status)} />
              {timing ? <Pill label={timing.label} tone={timing.tone} /> : null}
            </PillRow>
          </PressableCard>
        );
      })}
    </View>
  );
}

function RecentTickets({
  onOpen,
  onOpenAll,
}: {
  onOpen: (id: string) => void;
  onOpenAll?: () => void;
}) {
  const theme = useTheme();
  // The Tickets tab's own query.
  const list = usePagedResource<TicketSummary>(['tickets'], '/tickets', { limit: 20 });
  const tickets = list.items.filter(Boolean).slice(0, PREVIEW);

  if (list.isLoading || list.error || tickets.length === 0) {
    return null;
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <SectionHeader
        title="Tickets"
        action={
          onOpenAll ? (
            <Button label="All tickets" variant="ghost" size="sm" onPress={onOpenAll} />
          ) : null
        }
      />
      {tickets.map((ticket) => (
        <PressableCard
          key={ticket.id}
          accessibilityLabel={`${ticket.key} ${ticket.title}`}
          onPress={() => onOpen(ticket.id)}
        >
          <AppText size="xs" tone="faint" numberOfLines={1}>
            {ticket.key} · {ticket.clientOrganization.name}
          </AppText>
          <AppText weight="medium" numberOfLines={2}>
            {ticket.title}
          </AppText>
          <PillRow>
            <Pill label={TICKET_STATUS_LABELS[ticket.status]} tone={ticketTone(ticket.status)} />
            {ticket.sla?.overall === 'BREACHED' ? (
              <Pill label="SLA breached" tone="danger" />
            ) : null}
          </PillRow>
        </PressableCard>
      ))}
    </View>
  );
}
