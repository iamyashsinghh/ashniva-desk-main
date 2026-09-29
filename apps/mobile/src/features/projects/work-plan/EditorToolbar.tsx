import { View } from 'react-native';

import { IconTile } from '../../../shared/components/Icon';
import { AppText, Button, Card } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';

/** The two ways to fill the plan without typing every step: a PDF brief, or a sentence for AI. */
export function EditorToolbar({
  pdfLocked,
  pdfBusy,
  onPdf,
  onAddWork,
}: {
  /** Someone has started a step: the server refuses a PDF that would replace the plan. */
  pdfLocked: boolean;
  pdfBusy: boolean;
  onPdf: () => void;
  onAddWork: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      <Card>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <IconTile name="document-text-outline" tone="orange" size={40} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText weight="bold">Upload PDF</AppText>
            <AppText size="sm" tone="muted">
              {pdfLocked
                ? 'Someone has already started, so a PDF cannot replace this plan. Edit or add phases by hand instead.'
                : 'AI reads the brief and divides it into phases. You can still edit every heading, topic and step.'}
            </AppText>
          </View>
        </View>
        <Button
          label="Choose PDF"
          icon="cloud-upload-outline"
          variant="secondary"
          size="sm"
          loading={pdfBusy}
          disabled={pdfLocked}
          onPress={onPdf}
        />
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <IconTile name="sparkles" tone="violet" size={40} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText weight="bold">Add work with AI</AppText>
            <AppText size="sm" tone="muted">
              Describe the extra work. AI picks the right phase, or opens a new one, and fills steps
              and times.
            </AppText>
          </View>
        </View>
        <Button
          label="Describe work"
          icon="sparkles-outline"
          variant="secondary"
          size="sm"
          onPress={onAddWork}
        />
      </Card>
    </View>
  );
}
