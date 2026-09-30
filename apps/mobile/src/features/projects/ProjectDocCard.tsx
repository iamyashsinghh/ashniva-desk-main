import type { ProjectDoc } from '@ashniva/types';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { AppText, Button, Card, Divider } from '../../shared/components/primitives';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * The project's Markdown document — features, structure and flow — written by Gemini from the
 * Summary and rebuilt as the work moves. Collapsed until opened, because it can be long.
 */
export function ProjectDocCard({ projectId }: { projectId: string }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const key = ['projects', projectId, 'work-plan', 'doc'] as const;
  const cached = queryClient.getQueryData<ProjectDoc>(key);
  const doc = useResource<ProjectDoc>(key, `/projects/${projectId}/work-plan/doc`, {
    refetchInterval: cached?.refreshing ? 4_000 : false,
  });
  const refresh = useApiMutation<void, ProjectDoc>({
    path: `/projects/${projectId}/work-plan/doc/refresh`,
    onSuccess: (result) => queryClient.setQueryData(key, result),
  });

  const current = doc.data ?? null;
  const writing = Boolean(current?.refreshing) || refresh.busy;

  return (
    <Card>
      <AppText size="sm" tone="muted" weight="medium">
        Project document
      </AppText>
      <AppText weight="bold">{current?.fileName ?? 'Project .md'}</AppText>
      <AppText size="xs" tone="faint">
        {docStatus(current, writing)}
      </AppText>
      {doc.error && !current ? (
        <AppText size="sm" tone="danger">
          {errorMessage(doc.error)}
        </AppText>
      ) : null}
      {refresh.error ? (
        <AppText size="sm" tone="danger">
          {refresh.error}
        </AppText>
      ) : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button
            label={open ? 'Hide' : 'Read'}
            variant="secondary"
            disabled={!current?.markdown}
            onPress={() => setOpen((value) => !value)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="Update now"
            variant="secondary"
            loading={writing}
            disabled={writing}
            onPress={() => void refresh.run()}
            accessibilityHint="Writes the document again from the current Summary"
          />
        </View>
      </View>

      {open && current?.markdown ? (
        <View style={{ gap: theme.spacing.xs }}>
          <Divider />
          <MarkdownText markdown={current.markdown} />
        </View>
      ) : null}
    </Card>
  );
}

function docStatus(doc: ProjectDoc | null, writing: boolean): string {
  if (writing) {
    return 'Writing a new version from the Summary…';
  }
  if (!doc?.markdown) {
    return 'Not written yet. It appears once the Summary has work in it.';
  }
  const by = doc.generatedBy === 'AI' ? 'Written by Gemini' : 'Outline from the Summary';
  const when = formatDateTime(doc.generatedAt);
  const stale = doc.stale ? ' · a newer version is on its way' : '';
  return `${by}${when ? ` · ${when}` : ''}${stale}`;
}

/** Headings, bullets and paragraphs — enough to read the document on a phone. */
function MarkdownText({ markdown }: { markdown: string }) {
  const theme = useTheme();
  const blocks: ReactNode[] = [];
  let inCode = false;

  markdown.split('\n').forEach((raw, index) => {
    const line = raw.trimEnd();
    if (line.trim().startsWith('```')) {
      inCode = !inCode;
      return;
    }
    if (inCode) {
      blocks.push(
        <AppText key={index} size="xs" tone="muted">
          {line}
        </AppText>,
      );
      return;
    }
    if (!line.trim() || /^(-{3,}|\*{3,})$/.test(line.trim())) {
      return;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      blocks.push(
        <View key={index} style={{ paddingTop: theme.spacing.sm }}>
          <AppText size={level <= 2 ? 'lg' : 'body'} weight="bold">
            {plain(heading[2] ?? '')}
          </AppText>
        </View>,
      );
      return;
    }
    const bullet = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      const depth = Math.min(Math.floor((bullet[1]?.length ?? 0) / 2), 3);
      const marker = /\d/.test(bullet[2] ?? '') ? bullet[2] : '•';
      blocks.push(
        <View key={index} style={{ paddingLeft: theme.spacing.md * depth }}>
          <AppText size="sm">
            {marker} {plain(bullet[3] ?? '')}
          </AppText>
        </View>,
      );
      return;
    }
    blocks.push(
      <AppText key={index} size="sm" tone={line.startsWith('>') ? 'muted' : 'default'}>
        {plain(line.replace(/^>\s?/, ''))}
      </AppText>,
    );
  });

  return <View style={{ gap: theme.spacing.xs }}>{blocks}</View>;
}

/** Drops inline Markdown marks (bold, italic, code, links) so the words read cleanly. */
function plain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1');
}
