import type { TicketDetail } from '@ashniva/types';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { useApiMutation } from '../../../shared/api/mutations';
import { DateTimeField } from '../../../shared/components/DateTimeField';
import { Banner } from '../../../shared/components/feedback';
import { UserPicker } from '../../../shared/components/pickers';
import { AppText, Button, Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import { Sheet } from '../../../shared/components/Sheet';
import { todayIsoDate } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { isTester, isWorker } from '../ticket-display';
import { useTicketProjectOptions } from '../ticket-options';

interface TaskDraft {
  title: string;
  assignedToId: string | null;
  dueDate: string | null;
}

/**
 * One ticket into one or several linked tasks, as the web's convert dialog does it.
 *
 * The project list is narrowed to this ticket's client (or projects with no client), because a
 * task on another client's project would carry this client's problem into their space.
 */
export function ConvertTicketSheet({
  visible,
  ticket,
  onClose,
  onConverted,
}: {
  visible: boolean;
  ticket: TicketDetail;
  onClose: () => void;
  onConverted: () => void;
}) {
  const theme = useTheme();
  const projects = useTicketProjectOptions(false, visible);
  const [projectId, setProjectId] = useState<string | null>(ticket.project?.id ?? null);
  const [testerId, setTesterId] = useState<string | null>(null);
  const [clientVisible, setClientVisible] = useState(true);
  const [tasks, setTasks] = useState<TaskDraft[]>([
    { title: ticket.title, assignedToId: ticket.assignedTo?.id ?? null, dueDate: todayIsoDate() },
  ]);

  const convert = useApiMutation<void, TicketDetail>({
    path: `/tickets/${ticket.id}/convert`,
    body: () => ({
      projectId,
      clientVisible,
      ...(testerId ? { testerId } : {}),
      tasks: tasks.map((task) => ({
        title: task.title.trim(),
        ...(task.assignedToId ? { assignedToId: task.assignedToId } : {}),
        ...(task.dueDate ? { dueDate: task.dueDate } : {}),
      })),
    }),
    invalidate: [['tickets'], ['tasks']],
    onSuccess: onConverted,
  });

  const options = projects.options.filter(
    (project) =>
      !project.clientOrganizationId ||
      project.clientOrganizationId === ticket.clientOrganization.id,
  );
  const valid = Boolean(projectId) && tasks.every((task) => task.title.trim().length >= 3);
  const update = (index: number, patch: Partial<TaskDraft>) =>
    setTasks((current) => current.map((task, at) => (at === index ? { ...task, ...patch } : task)));

  return (
    <Sheet
      visible={visible}
      title="Convert to task"
      subtitle={`${ticket.key} · ${ticket.clientOrganization.name}`}
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label={tasks.length === 1 ? 'Create task' : `Create ${tasks.length} tasks`}
            icon="git-branch-outline"
            loading={convert.busy}
            disabled={!valid}
            onPress={() => void convert.run()}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <SelectField
        label="Project"
        required
        icon="folder-outline"
        options={options}
        value={projectId ? [projectId] : []}
        onChange={(ids) => setProjectId(ids[0] ?? null)}
        loading={projects.isLoading}
        placeholder="Choose a project"
      />
      {tasks.map((task, index) => (
        <View
          key={index}
          style={{
            backgroundColor: theme.colors.surfaceSunken,
            borderRadius: theme.radius.md,
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
          }}
        >
          <Field label={`Task ${index + 1}`} required>
            <Input
              accessibilityLabel={`Task ${index + 1} title`}
              value={task.title}
              onChangeText={(title) => update(index, { title })}
            />
          </Field>
          <UserPicker
            label="Assign to"
            value={task.assignedToId ? [task.assignedToId] : []}
            onChange={(ids) => update(index, { assignedToId: ids[0] ?? null })}
            filter={isWorker}
          />
          <DateTimeField
            label="Due"
            value={task.dueDate}
            onChange={(dueDate) => update(index, { dueDate })}
          />
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Button
          label="Another task"
          icon="add"
          size="sm"
          variant="secondary"
          disabled={tasks.length >= 10}
          onPress={() =>
            setTasks((current) => [
              ...current,
              { title: '', assignedToId: null, dueDate: todayIsoDate() },
            ])
          }
        />
        {tasks.length > 1 ? (
          <Button
            label="Remove last"
            size="sm"
            variant="ghost"
            onPress={() => setTasks((current) => current.slice(0, -1))}
          />
        ) : null}
      </View>
      <UserPicker
        label="Tester"
        value={testerId ? [testerId] : []}
        onChange={(ids) => setTesterId(ids[0] ?? null)}
        filter={isTester}
        placeholder="Any tester"
      />
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText weight="medium">Client-visible</AppText>
          <AppText size="xs" tone="muted">
            The requester sees progress and a published update when it is done.
          </AppText>
        </View>
        <Switch
          accessibilityLabel="Client-visible"
          value={clientVisible}
          onValueChange={setClientVisible}
          trackColor={{ true: theme.colors.success, false: theme.colors.borderStrong }}
        />
      </View>
      {convert.error ? (
        <Banner tone="danger" role="alert">
          {convert.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
