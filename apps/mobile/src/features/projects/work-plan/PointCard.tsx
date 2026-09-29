import { WORK_PLAN_POINT_STATUS_LABELS, type WorkPlanPoint } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { MetaLine } from '../../../shared/components/data-display';
import { Banner } from '../../../shared/components/feedback';
import { IconTile } from '../../../shared/components/Icon';
import { AppText, Button, Pill, PillRow } from '../../../shared/components/primitives';
import { animateLayout } from '../../../shared/theme/motion';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { LeadLog } from './LeadLog';
import { NotesSheet } from './NotesSheet';
import { PointActions } from './PointActions';
import { PointTimer } from './PointTimer';
import { pointStatusIcon, pointStatusTone, showsTimer } from './plan-helpers';
import { usePointRunner } from './point-runner';
import { ReturnSheet } from './ReturnSheet';

/** One step: what it is, where it stands, its clock, and the buttons this person may press. */
export function PointCard({ point }: { point: WorkPlanPoint }) {
  const theme = useTheme();
  const runner = usePointRunner();
  const [returning, setReturning] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const icon = pointStatusIcon(point);
  const failure = runner.failure?.pointId === point.id ? runner.failure.message : null;
  const done = Boolean(point.completedAt);

  return (
    <View
      style={{
        backgroundColor: point.isError ? theme.colors.dangerSoft : theme.colors.surfaceRaised,
        borderColor: point.overdue && !done ? theme.colors.danger : theme.colors.border,
        borderRadius: theme.radius.sm + 2,
        borderWidth: 1,
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <IconTile name={icon.name} tone={icon.tone} size={32} />
        <View style={{ flex: 1, gap: 6 }}>
          <AppText
            size="sm"
            weight="medium"
            tone={done ? 'muted' : 'default'}
            style={done ? { textDecorationLine: 'line-through' } : null}
          >
            {point.body ?? 'Step hidden from you'}
          </AppText>
          <PillRow>
            <Pill
              label={WORK_PLAN_POINT_STATUS_LABELS[point.status]}
              tone={pointStatusTone(point.status)}
            />
            {point.isError ? <Pill label="Tester error" tone="danger" /> : null}
          </PillRow>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
            <MetaLine icon="time-outline">
              {point.isError ? 'error' : `${point.estimateMinutes} min`}
            </MetaLine>
            {point.startedBy && point.startedAt ? (
              <MetaLine icon="person-outline">{point.startedBy.name}</MetaLine>
            ) : null}
          </View>
        </View>
      </View>

      {showsTimer(point) ? <PointTimer point={point} /> : null}

      <PointActions point={point} onReturn={() => setReturning(true)} />

      {failure ? (
        <Banner
          tone="danger"
          role="alert"
          action={
            <Button label="Dismiss" variant="ghost" size="sm" onPress={runner.dismissFailure} />
          }
        >
          {failure}
        </Banner>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        {point.notes.length > 0 || point.canDoubt ? (
          <Button
            label={point.notes.length > 0 ? `Notes (${point.notes.length})` : 'Ask a doubt'}
            icon="chatbubble-ellipses-outline"
            variant="ghost"
            size="sm"
            onPress={() => setNotesOpen(true)}
          />
        ) : null}
        {runner.showLeadLog ? (
          <Button
            label={detailOpen ? 'Hide detail' : 'View detail'}
            icon="analytics-outline"
            variant="ghost"
            size="sm"
            onPress={() => {
              animateLayout();
              setDetailOpen((open) => !open);
            }}
          />
        ) : null}
      </View>

      {runner.showLeadLog && detailOpen ? <LeadLog point={point} /> : null}

      {/* Mounted only while open: a long plan would otherwise hold two modals per step. */}
      {returning ? (
        <ReturnSheet pointId={point.id} visible onClose={() => setReturning(false)} />
      ) : null}
      {notesOpen ? <NotesSheet point={point} visible onClose={() => setNotesOpen(false)} /> : null}
    </View>
  );
}
