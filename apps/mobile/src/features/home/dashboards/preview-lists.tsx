import {
  TASK_STATUS_LABELS,
  TICKET_STATUS_LABELS,
  type TaskSummary,
  type TicketSummary,
} from '@ashniva/types';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Icon, type IconName, type IconTone } from '../../../shared/components/Icon';
import { PressableCard, SectionHeader } from '../../../shared/components/layout';
import { AppText, Button, Pill, PillRow, cardStyle } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { taskTone, timingPill } from '../../tasks/task-display';
import { ticketTone } from '../../tickets/ticket-display';
import type { CardTarget } from './card-targets';
import { useDashboardActions, useTargetPress } from './dashboard-actions';

/**
 * The lists under a dashboard's tiles, as compact cards.
 *
 * The API already cut each list to what a dashboard shows; a phone shows the first few and offers
 * the full filtered list behind "See all" when the tiles above have one.
 */

const VISIBLE = 5;

export function DashboardSection({
  title,
  icon,
  count,
  seeAll = null,
  children,
}: {
  title: string;
  icon: IconName;
  count?: number;
  seeAll?: CardTarget | null;
  children: ReactNode;
}) {
  const theme = useTheme();
  const openAll = useTargetPress(seeAll);
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <SectionHeader
        title={title}
        icon={icon}
        {...(count !== undefined ? { count } : {})}
        action={
          openAll ? (
            <Button label="See all" variant="ghost" size="sm" onPress={openAll} />
          ) : undefined
        }
      />
      {children}
    </View>
  );
}

/** An empty list as one quiet line, not a full-screen illustration in the middle of Home. */
export function CompactEmpty({
  title,
  icon = 'checkmark-circle-outline',
}: {
  title: string;
  icon?: IconName;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        cardStyle(theme),
        { alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm },
      ]}
    >
      <Icon name={icon} size={18} color={theme.colors.textFaint} />
      <AppText size="sm" tone="muted" style={{ flex: 1 }}>
        {title}
      </AppText>
    </View>
  );
}

export function TaskPreviewList({
  title,
  icon,
  tasks,
  emptyTitle,
  seeAll = null,
  showAssignee = true,
  iconTone = 'info',
}: {
  title: string;
  icon: IconName;
  tasks: TaskSummary[];
  emptyTitle: string;
  seeAll?: CardTarget | null;
  showAssignee?: boolean;
  iconTone?: IconTone;
}) {
  const { onOpenTask } = useDashboardActions();
  return (
    <DashboardSection title={title} icon={icon} count={tasks.length} seeAll={seeAll}>
      {tasks.length === 0 ? <CompactEmpty title={emptyTitle} /> : null}
      {tasks.slice(0, VISIBLE).map((task) => {
        const timing = timingPill(task.timing);
        const context = [
          task.key,
          task.project.name,
          showAssignee ? (task.assignedTo?.name ?? 'Unassigned') : null,
        ].filter(Boolean);
        return (
          <PressableCard
            key={task.id}
            accessibilityLabel={`${task.key} ${task.title}`}
            onPress={() => onOpenTask?.(task.id)}
            chevron={Boolean(onOpenTask)}
            icon="checkbox-outline"
            iconTone={task.isOverdue ? 'danger' : iconTone}
          >
            <AppText size="xs" tone="faint" numberOfLines={1}>
              {context.join(' · ')}
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
    </DashboardSection>
  );
}

export function TicketPreviewList({
  title,
  icon,
  tickets,
  emptyTitle,
  seeAll = null,
  showClient = true,
}: {
  title: string;
  icon: IconName;
  tickets: TicketSummary[];
  emptyTitle: string;
  seeAll?: CardTarget | null;
  showClient?: boolean;
}) {
  const { onOpenTicket } = useDashboardActions();
  return (
    <DashboardSection title={title} icon={icon} count={tickets.length} seeAll={seeAll}>
      {tickets.length === 0 ? <CompactEmpty title={emptyTitle} /> : null}
      {tickets.slice(0, VISIBLE).map((ticket) => {
        const breached = ticket.sla?.overall === 'BREACHED';
        return (
          <PressableCard
            key={ticket.id}
            accessibilityLabel={`${ticket.key} ${ticket.title}`}
            onPress={() => onOpenTicket?.(ticket.id)}
            chevron={Boolean(onOpenTicket)}
            icon="ticket"
            iconTone={breached ? 'danger' : 'orange'}
          >
            <AppText size="xs" tone="faint" numberOfLines={1}>
              {showClient ? `${ticket.key} · ${ticket.clientOrganization.name}` : ticket.key}
            </AppText>
            <AppText weight="medium" numberOfLines={2}>
              {ticket.title}
            </AppText>
            <PillRow>
              <Pill label={TICKET_STATUS_LABELS[ticket.status]} tone={ticketTone(ticket.status)} />
              {breached ? <Pill label="SLA breached" tone="danger" /> : null}
            </PillRow>
          </PressableCard>
        );
      })}
    </DashboardSection>
  );
}
