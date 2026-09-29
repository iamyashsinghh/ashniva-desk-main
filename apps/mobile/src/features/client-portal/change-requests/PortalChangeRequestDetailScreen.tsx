import {
  CHANGE_REQUEST_STATUS,
  CHANGE_REQUEST_STATUS_LABELS,
  type PortalChangeRequestDetail,
} from '@ashniva/types';

import { useResource } from '../../../shared/api/queries';
import { MetaLine } from '../../../shared/components/data-display';
import { Hero, Section } from '../../../shared/components/layout';
import { Pill, PillRow } from '../../../shared/components/primitives';
import { formatSince } from '../../../shared/format/format';
import { useSession } from '../../auth/SessionProvider';
import { changeRequestTone, ICON_TONES } from '../portal-display';
import { portalKeys } from '../portal-keys';
import { DetailFrame, RecordState } from '../PortalFrame';
import { PortalFileList } from '../PortalFileList';
import { isClosedChangeRequest, portalChangeRequestActions } from './change-request-actions';
import {
  RequestDetails,
  RequestDiscussion,
  RequestHistory,
  RequestImpact,
  RequestOverview,
} from './change-request-sections';
import { ChangeRequestActionBar } from './ChangeRequestActionBar';

/**
 * One change request from the client's side: what they asked for, the provider's estimate, the
 * conversation, and the buttons for whatever the client does next — submit their draft, or
 * approve, send back or reject the provider's estimate.
 */
export function PortalChangeRequestDetailScreen({
  changeRequestId,
  onOpenProject,
}: {
  changeRequestId: string;
  onOpenProject?: (projectId: string) => void;
}) {
  const { user, can } = useSession();
  const query = useResource<PortalChangeRequestDetail>(
    portalKeys.changeRequest(changeRequestId),
    `/portal/change-requests/${changeRequestId}`,
  );
  const cr = query.data;
  if (!cr) {
    return <RecordState query={query} loadingLabel="Loading the change request" />;
  }

  const tone = changeRequestTone(cr.status);
  const waiting = cr.status === CHANGE_REQUEST_STATUS.CLIENT_REVIEW;
  const nothingToDo =
    portalChangeRequestActions(cr, user?.id ?? null, can).length === 0 &&
    !isClosedChangeRequest(cr.status);

  return (
    <DetailFrame
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      actions={<ChangeRequestActionBar cr={cr} />}
    >
      <Hero
        overline={cr.project ? `${cr.number} · ${cr.project.name}` : cr.number}
        title={cr.title}
        icon="git-pull-request"
        iconTone={ICON_TONES[tone]}
      >
        <PillRow>
          <Pill label={CHANGE_REQUEST_STATUS_LABELS[cr.status]} tone={tone} />
          {waiting ? <Pill label="Your decision is needed" tone="warning" /> : null}
        </PillRow>
        <MetaLine icon="time-outline">Updated {formatSince(cr.updatedAt)}</MetaLine>
        {nothingToDo ? (
          <MetaLine icon="construct-outline">The provider is working on this request.</MetaLine>
        ) : null}
      </Hero>

      <RequestOverview cr={cr} />
      <RequestImpact cr={cr} />
      <RequestDiscussion cr={cr} />
      <Section title="Files" icon="attach-outline" count={cr.files.length}>
        <PortalFileList files={cr.files} emptyText="No files." />
      </Section>
      <RequestHistory history={cr.history} />
      <RequestDetails cr={cr} {...(onOpenProject ? { onOpenProject } : {})} />
    </DetailFrame>
  );
}
