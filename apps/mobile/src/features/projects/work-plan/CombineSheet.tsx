import { combineWorkPlanTitles, type WorkPlanPhase } from '@ashniva/types';
import { View } from 'react-native';

import { Banner } from '../../../shared/components/feedback';
import { AppText, Button } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { useTheme } from '../../../shared/theme/ThemeProvider';

/**
 * Confirms a combine before it runs, showing the topic it will produce.
 *
 * The preview is `combineWorkPlanTitles` from `@ashniva/types` — the same rule the server applies —
 * so what is shown is what will be saved: the names joined, every step's text in one, the minutes
 * added up.
 */
export function CombineSheet({
  phase,
  titleIds,
  busy,
  error,
  onApply,
  onClose,
}: {
  phase: WorkPlanPhase;
  titleIds: readonly string[];
  busy: boolean;
  error: string | null;
  onApply: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const picked = phase.titles.filter((title) => titleIds.includes(title.id));
  let preview: ReturnType<typeof combineWorkPlanTitles> | null = null;
  let problem: string | null = null;
  try {
    preview = combineWorkPlanTitles({
      titles: picked.map((title) => ({
        title: title.title,
        points: title.points.map((point) => ({
          body: point.body ?? '',
          estimateMinutes: point.estimateMinutes,
          isError: point.isError,
        })),
      })),
    });
  } catch (cause) {
    problem = cause instanceof Error ? cause.message : 'These topics cannot be combined';
  }

  return (
    <Sheet
      visible
      title={`Combine ${picked.length} topics`}
      subtitle={`In ${phase.heading}. Their minutes add into one topic.`}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <View style={{ flex: 1 }}>
            <Button label="Cancel" variant="secondary" disabled={busy} onPress={onClose} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Combine"
              icon="git-merge-outline"
              loading={busy}
              disabled={!preview}
              onPress={onApply}
            />
          </View>
        </>
      }
    >
      {error || problem ? (
        <Banner tone="danger" role="alert">
          {error ?? problem ?? ''}
        </Banner>
      ) : null}
      {preview ? (
        <View
          style={{
            backgroundColor: theme.colors.primarySoft,
            borderRadius: theme.radius.md,
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
          }}
        >
          <AppText variant="label" tone="primary" uppercase>
            New topic · {preview.estimateMinutes} min
          </AppText>
          <AppText weight="bold">{preview.title}</AppText>
          <AppText size="sm" tone="muted">
            {preview.body}
          </AppText>
        </View>
      ) : null}
      <AppText variant="label" tone="muted" uppercase>
        Replaces
      </AppText>
      {picked.map((title) => (
        <AppText key={title.id} size="sm">
          • {title.title}
        </AppText>
      ))}
    </Sheet>
  );
}
