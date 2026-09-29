import {
  CLIENT_UPDATE_STATUS,
  PERMISSIONS,
  type ClientUpdateSummary,
  type OrganizationOption,
} from '@ashniva/types';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useResource } from '../../shared/api/queries';
import { DateTimeField } from '../../shared/components/DateTimeField';
import { Banner } from '../../shared/components/feedback';
import { Grow, StickyActionBar } from '../../shared/components/layout';
import { Segmented } from '../../shared/components/navigation-list';
import { AppText, Button, Screen } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import { todayIsoDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { PublishedList, QueueList } from './CompletedTodayLists';
import {
  COMPLETED_TODAY_TABS,
  audienceName,
  clientOptions,
  longDate,
  publishAllBlocked,
  updatesKey,
  updatesQuery,
  type CompletedTodayTab,
} from './completed-today';
import { EditWordingSheet } from './EditWordingSheet';
import { useClientUpdateActions } from './use-client-update-actions';
import { PullRefresh } from '../../shared/components/PullRefresh';

const { PENDING, PUBLISHED } = CLIENT_UPDATE_STATUS;

/**
 * Completed Today: the publish queue, and what each client sees.
 *
 * Completing a client-visible task drafts an update; nothing reaches the client until a senior
 * publishes it here, and publishing is an explicit, audited action on the API. The buttons follow
 * `client-update:publish`, as the web's do, and the API checks it again on every request.
 */
export function CompletedTodayScreen({
  onOpenTask,
  onOpenProject,
}: {
  onOpenTask: (taskId: string) => void;
  onOpenProject?: (projectId: string) => void;
}) {
  const theme = useTheme();
  const canPublish = useSession().can(PERMISSIONS.CLIENT_UPDATE_PUBLISH);
  const [tab, setTab] = useState<CompletedTodayTab>('queue');
  const [date, setDate] = useState(todayIsoDate());
  const [clientId, setClientId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClientUpdateSummary | null>(null);

  const organizations = useResource<OrganizationOption[]>(
    ['organizations', 'options'],
    '/organizations/options',
  );
  const pending = useResource<ClientUpdateSummary[]>(
    updatesKey(PENDING, clientId),
    '/client-updates',
    { query: updatesQuery(PENDING, clientId) },
  );
  const published = useResource<ClientUpdateSummary[]>(
    updatesKey(PUBLISHED, clientId, date),
    '/client-updates',
    { query: updatesQuery(PUBLISHED, clientId, date) },
  );
  const actions = useClientUpdateActions();

  const orgs = useMemo(() => organizations.data ?? [], [organizations.data]);
  const clients = useMemo(() => clientOptions(orgs), [orgs]);
  const queue = pending.data ?? [];
  const blocked = publishAllBlocked(canPublish, queue.length);
  const listProps = {
    canPublish,
    actions,
    onOpenTask,
    ...(onOpenProject ? { onOpenProject } : {}),
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.screen }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <PullRefresh
            busy={pending.isRefetching || published.isRefetching}
            onRefresh={() => {
              void pending.refetch();
              void published.refetch();
            }}
            tintColor={theme.colors.primary}
          />
        }
      >
        <SelectField
          label="Client"
          icon="business-outline"
          options={clients}
          value={clientId ? [clientId] : []}
          onChange={(ids) => setClientId(ids[0] ?? null)}
          allowClear
          clearLabel="All clients"
          placeholder="All clients"
          loading={organizations.isLoading}
        />
        <Segmented
          label="Which list"
          options={COMPLETED_TODAY_TABS}
          value={tab}
          onChange={setTab}
        />
        {tab === 'queue' ? (
          <AppText size="sm" tone="muted">
            {`${queue.length} client-visible ${queue.length === 1 ? 'update is' : 'updates are'} waiting for a senior to publish.`}
          </AppText>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            <DateTimeField
              label="Day"
              value={date}
              onChange={(next) => setDate(next ?? todayIsoDate())}
              allowClear={false}
            />
            <AppText size="sm" tone="muted">
              {`What ${audienceName(orgs, clientId)} see for ${longDate(date)}.`}
            </AppText>
          </View>
        )}
        {actions.error ? (
          <Banner tone="danger" role="alert" title="That did not go through">
            {actions.error}
          </Banner>
        ) : null}
        {tab === 'queue' ? (
          <QueueList query={pending} onEdit={setEditing} {...listProps} />
        ) : (
          <PublishedList query={published} {...listProps} />
        )}
      </ScrollView>
      {/* Only with something queued; when the reason is the permission, the list's banner says so. */}
      {tab === 'queue' && queue.length > 0 ? (
        <StickyActionBar>
          <Grow>
            <Button
              label={`Publish ${queue.length} approved`}
              icon="send-outline"
              disabled={Boolean(blocked) || actions.busy}
              {...(blocked ? { accessibilityHint: blocked } : {})}
              loading={actions.publishingAll}
              onPress={() => void actions.publishAll(queue.map((update) => update.id))}
            />
          </Grow>
        </StickyActionBar>
      ) : null}
      {editing ? <EditWordingSheet update={editing} onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}
