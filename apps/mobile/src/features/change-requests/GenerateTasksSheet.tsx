import { PERMISSIONS, type ChangeRequestDetail, type MilestoneSummary } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { DateTimeField } from '../../shared/components/DateTimeField';
import { Segmented } from '../../shared/components/navigation-list';
import { UserPicker } from '../../shared/components/pickers';
import { AppText, Button, Divider, Field, Input } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import { Sheet } from '../../shared/components/Sheet';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { ErrorNote, SheetActions } from '../contracts/commercial-ui';
import { isWorker } from '../tasks/task-people';
import { ToggleRow } from '../tasks/ToggleRow';
import { CHANGE_REQUEST_INVALIDATES } from './change-request-display';

type MilestoneMode = 'new' | 'existing' | 'none';

interface TaskDraft {
  title: string;
  assignedToId: string | null;
  dueDate: string | null;
}

/** The API's ceiling on one request. */
const MAX_TASKS = 20;

/**
 * An approved change becomes work: linked tasks, under a new milestone, an existing one, or none.
 *
 * Existing milestones are listed only for somebody with `milestone:manage`, the permission the
 * list endpoint asks for; anybody else is offered "new" and "none" rather than an empty picker.
 */
export function GenerateTasksSheet({
  cr,
  onClose,
}: {
  cr: ChangeRequestDetail;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const canListMilestones = can(PERMISSIONS.MILESTONE_MANAGE) && cr.project !== null;
  const [mode, setMode] = useState<MilestoneMode>('new');
  const [milestoneId, setMilestoneId] = useState<string | null>(null);
  const [milestoneName, setMilestoneName] = useState(cr.title);
  const [clientVisible, setClientVisible] = useState(true);
  const [tasks, setTasks] = useState<TaskDraft[]>([
    { title: cr.title, assignedToId: null, dueDate: null },
  ]);
  const milestones = useResource<MilestoneSummary[]>(
    ['milestones', 'list', cr.project?.id],
    '/milestones',
    { enabled: canListMilestones && mode === 'existing', query: { projectId: cr.project?.id } },
  );

  const valid =
    tasks.every((task) => task.title.trim().length >= 3) &&
    (mode !== 'existing' || milestoneId !== null) &&
    (mode !== 'new' || milestoneName.trim().length >= 2);

  const update = (index: number, patch: Partial<TaskDraft>) =>
    setTasks((current) => current.map((task, at) => (at === index ? { ...task, ...patch } : task)));

  const generate = useApiMutation<void>({
    path: `/change-requests/${cr.id}/generate-tasks`,
    body: () => ({
      ...(mode === 'existing' && milestoneId ? { milestoneId } : {}),
      ...(mode === 'new' ? { milestone: { name: milestoneName.trim(), clientVisible } } : {}),
      tasks: tasks.map((task) => ({
        title: task.title.trim(),
        ...(task.assignedToId ? { assignedToId: task.assignedToId } : {}),
        ...(task.dueDate ? { dueDate: task.dueDate } : {}),
      })),
    }),
    invalidate: CHANGE_REQUEST_INVALIDATES,
    onSuccess: onClose,
  });

  const modes = [
    { value: 'new' as const, label: 'New milestone' },
    ...(canListMilestones ? [{ value: 'existing' as const, label: 'Existing' }] : []),
    { value: 'none' as const, label: 'None' },
  ];

  return (
    <Sheet
      visible
      title="Create the work"
      {...(cr.project ? { subtitle: `In ${cr.project.name}` } : {})}
      onClose={onClose}
      footer={
        <SheetActions
          confirmLabel={tasks.length === 1 ? 'Create task' : `Create ${tasks.length} tasks`}
          confirmIcon="git-branch-outline"
          busy={generate.busy}
          disabled={!valid}
          onCancel={onClose}
          onConfirm={() => void generate.run()}
        />
      }
    >
      <Segmented label="Milestone" options={modes} value={mode} onChange={setMode} />
      {mode === 'existing' ? (
        <SelectField
          label="Existing milestone"
          icon="flag-outline"
          required
          options={(milestones.data ?? []).map((m) => ({ value: m.id, label: m.name }))}
          value={milestoneId ? [milestoneId] : []}
          onChange={(ids) => setMilestoneId(ids[0] ?? null)}
          loading={milestones.isLoading}
          placeholder="Choose"
        />
      ) : null}
      {mode === 'new' ? (
        <>
          <Field label="Milestone name" required>
            <Input
              accessibilityLabel="Milestone name"
              maxLength={200}
              value={milestoneName}
              onChangeText={setMilestoneName}
            />
          </Field>
          <ToggleRow
            label="Client-visible milestone"
            description="The client follows it on their progress board."
            icon="eye-outline"
            value={clientVisible}
            onChange={setClientVisible}
          />
        </>
      ) : null}

      {tasks.map((task, index) => (
        <View key={index} style={{ gap: theme.spacing.sm }}>
          <Divider />
          <Field label={`Task ${index + 1}`} required>
            <Input
              accessibilityLabel={`Task ${index + 1} title`}
              maxLength={200}
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
          disabled={tasks.length >= MAX_TASKS}
          onPress={() =>
            setTasks((current) => [...current, { title: '', assignedToId: null, dueDate: null }])
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
      {!valid ? (
        <AppText size="sm" tone="muted">
          Every task needs a title of at least 3 characters, and the milestone a name or a choice.
        </AppText>
      ) : null}
      <ErrorNote message={generate.error} />
    </Sheet>
  );
}
