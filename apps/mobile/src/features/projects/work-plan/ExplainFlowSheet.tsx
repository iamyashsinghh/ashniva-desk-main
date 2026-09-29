import type { WorkPlanExplainPreview, WorkPlanExplainTitle } from '@ashniva/types';
import { ActivityIndicator, View } from 'react-native';

import { Banner } from '../../../shared/components/feedback';
import { IconTile } from '../../../shared/components/Icon';
import { AppText, Button } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import type { ExplainStep } from './use-assignment-save';

/**
 * The two sheets of the AI wording flow: the question, then the preview.
 *
 * The preview shows each rewritten step over what it replaces, and the minutes as unchanged,
 * because the server ignores the model's estimates — people set times, not the model.
 */
export function ExplainFlowSheet({
  step,
  preview,
  busy,
  error,
  onYes,
  onNo,
  onUpdate,
  onKeep,
  onRetry,
  onClose,
}: {
  step: ExplainStep;
  preview: WorkPlanExplainPreview | null;
  busy: boolean;
  error: string | null;
  onYes: () => void;
  onNo: () => void;
  onUpdate: () => void;
  onKeep: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();

  if (step === 'ask') {
    return (
      <Sheet
        visible
        title="Can we assign on my words?"
        subtitle="Yes lets AI rewrite the steps so the developer can follow them. No saves the assignment with exactly what you wrote."
        onClose={onClose}
        footer={
          <View style={{ flex: 1, gap: theme.spacing.sm }}>
            <Button label="Yes — rewrite with AI" icon="sparkles-outline" onPress={onYes} />
            <Button label="No — use my words" variant="secondary" onPress={onNo} />
          </View>
        }
      >
        <View style={{ alignItems: 'center', paddingVertical: theme.spacing.md }}>
          <IconTile name="sparkles" tone="violet" size={56} />
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible={step === 'review'}
      title="Update wording for the developer?"
      subtitle="Update uses this text; Keep mine keeps yours; Retry asks for another draft. Assignments are still saved only when you press Save."
      onClose={busy ? () => undefined : onClose}
      footer={
        <View style={{ flex: 1, gap: theme.spacing.sm }}>
          <Button
            label="Yes, update"
            icon="checkmark"
            loading={busy && Boolean(preview)}
            disabled={!preview || busy}
            onPress={onUpdate}
          />
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="No, keep mine" variant="secondary" disabled={busy} onPress={onKeep} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Retry"
                icon="refresh"
                variant="secondary"
                disabled={busy}
                onPress={onRetry}
              />
            </View>
          </View>
        </View>
      }
    >
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
      {busy && !preview ? (
        <View style={{ alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.xl }}>
          <ActivityIndicator color={theme.colors.primary} />
          <AppText size="sm" tone="muted">
            Rewriting steps…
          </AppText>
        </View>
      ) : null}
      {preview?.titles.map((title) => (
        <PreviewTitle key={title.id} title={title} />
      ))}
    </Sheet>
  );
}

function PreviewTitle({ title }: { title: WorkPlanExplainTitle }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
      }}
    >
      <AppText variant="label" tone="muted" uppercase>
        {title.phaseHeading}
      </AppText>
      <AppText weight="bold">{title.title}</AppText>
      {title.title !== title.originalTitle ? (
        <AppText size="xs" tone="faint">
          Was: {title.originalTitle}
        </AppText>
      ) : null}
      {title.points.map((point) => (
        <View
          key={point.id}
          style={{
            borderLeftColor: theme.colors.primary,
            borderLeftWidth: 2,
            gap: 2,
            paddingLeft: theme.spacing.sm,
          }}
        >
          <AppText size="sm">{point.body}</AppText>
          {point.body !== point.originalBody ? (
            <AppText size="xs" tone="faint">
              Was: {point.originalBody}
            </AppText>
          ) : null}
          <AppText size="xs" tone="muted">
            {point.estimateMinutes} min (unchanged)
          </AppText>
        </View>
      ))}
    </View>
  );
}
