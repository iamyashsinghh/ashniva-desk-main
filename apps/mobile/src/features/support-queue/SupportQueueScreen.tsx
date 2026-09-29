import { PERMISSIONS } from '@ashniva/types';
import { useState } from 'react';

import { Screen } from '../../shared/components/primitives';
import { EmptyState } from '../../shared/components/states';
import { TabBar } from '../../shared/components/TabBar';
import { useSession } from '../auth/SessionProvider';
import { useSupportQueue } from './api';
import { ProjectPane } from './ProjectPane';
import { QueueTab } from './QueueTab';

type Tab = 'queue' | 'team' | 'on-call';

/**
 * Support queue & routing — the web's `/support-queue`, with the day-to-day half of its routing
 * cards beside it.
 *
 * The queue is the web page. Team and On call are the parts of the web's routing configuration a
 * lead acts on during the day — marking somebody on leave, fixing their hours, covering a date —
 * because that is usually what put a ticket in the queue. Ownership itself (who the chain tries,
 * module owners, escalation clocks) is administration and stays on the web; it is shown here
 * read-only.
 *
 * Everything on this screen needs `support-routing:manage`, so without it nothing is fetched.
 */
export function SupportQueueScreen({ onOpenTicket }: { onOpenTicket: (id: string) => void }) {
  const { can } = useSession();
  const canManage = can(PERMISSIONS.SUPPORT_ROUTING_MANAGE);
  const [tab, setTab] = useState<Tab>('queue');
  const [projectId, setProjectId] = useState<string | null>(null);
  const queue = useSupportQueue(canManage);

  if (!canManage) {
    return (
      <Screen>
        <EmptyState
          icon="lock-closed-outline"
          title="Not available"
          description="The support queue needs the support-routing permission."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <TabBar
        accessibilityLabel="Support queue views"
        value={tab}
        onChange={setTab}
        options={[
          {
            value: 'queue',
            label: 'Queue',
            icon: 'file-tray-full-outline',
            ...(queue.data ? { count: queue.data.length } : {}),
          },
          { value: 'team', label: 'Team', icon: 'people-outline' },
          { value: 'on-call', label: 'On call', icon: 'call-outline' },
        ]}
      />
      {tab === 'queue' ? (
        <QueueTab queue={queue} onOpenTicket={onOpenTicket} />
      ) : (
        <ProjectPane view={tab} projectId={projectId} onProjectChange={setProjectId} />
      )}
    </Screen>
  );
}
