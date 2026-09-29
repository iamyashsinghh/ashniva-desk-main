import { TASK_STATUS_LABELS, TICKET_ACTION, type TicketDetail } from '@ashniva/types';
import { useState } from 'react';

import { ListRow } from '../../../shared/components/data-display';
import { Section } from '../../../shared/components/layout';
import { AppText, Button, Pill } from '../../../shared/components/primitives';
import { taskTone } from '../../tasks/task-display';
import { ticketCan } from '../ticket-display';
import { ConvertTicketSheet } from './ConvertTicketSheet';

/** The work this ticket became, and — when the API offers it — turning it into more. */
export function TicketLinkedTasks({
  ticket,
  onOpenTask,
}: {
  ticket: TicketDetail;
  onOpenTask?: (taskId: string) => void;
}) {
  const [converting, setConverting] = useState(false);
  const canConvert = ticketCan(ticket.actions, TICKET_ACTION.CONVERT);

  if (ticket.linkedTasks.length === 0 && !canConvert) {
    return null;
  }

  return (
    <Section
      title="Linked tasks"
      count={ticket.linkedTasks.length}
      icon="git-branch-outline"
      action={
        canConvert ? (
          <Button
            label="Convert to task"
            icon="add"
            size="sm"
            variant="ghost"
            onPress={() => setConverting(true)}
          />
        ) : undefined
      }
    >
      {ticket.linkedTasks.length === 0 ? (
        <AppText size="sm" tone="muted">
          No tasks yet. Converting creates one or more tasks linked to this ticket.
        </AppText>
      ) : null}
      {ticket.linkedTasks.map((task) => (
        <ListRow
          key={task.id}
          icon="checkbox-outline"
          iconTone="info"
          title={`${task.key} · ${task.title}`}
          subtitle={task.assignedTo?.name ?? 'Unassigned'}
          trailing={<Pill label={TASK_STATUS_LABELS[task.status]} tone={taskTone(task.status)} />}
          accessibilityHint="Opens the task"
          {...(onOpenTask ? { onPress: () => onOpenTask(task.id) } : {})}
        />
      ))}
      {canConvert ? (
        <ConvertTicketSheet
          visible={converting}
          ticket={ticket}
          onClose={() => setConverting(false)}
          onConverted={() => setConverting(false)}
        />
      ) : null}
    </Section>
  );
}
