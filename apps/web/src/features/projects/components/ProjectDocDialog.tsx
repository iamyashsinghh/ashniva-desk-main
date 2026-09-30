import { Alert, Button, Modal } from '@ashniva/ui';
import { Fragment, type ReactNode } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { useProjectDocQuery, useWorkPlanMutations } from '../work-plan-api';

/**
 * The project's own Markdown file: features, structure and flow, rewritten from the Summary as
 * work moves. Anyone on the project can read or download it.
 */
export function ProjectDocDialog({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const doc = useProjectDocQuery(projectId);
  const { refreshDoc } = useWorkPlanMutations(projectId);
  const data = doc.data;
  const markdown = data?.markdown ?? null;

  function download() {
    if (!markdown || !data) return;
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = data.fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal
      open
      size="lg"
      title={data?.fileName ?? `${projectName}.md`}
      description={describe(data)}
      onClose={onClose}
      headerActions={
        <>
          <Button
            size="sm"
            loading={refreshDoc.isPending || Boolean(data?.refreshing)}
            onClick={() => refreshDoc.mutate()}
          >
            Update now
          </Button>
          <Button variant="primary" size="sm" disabled={!markdown} onClick={download}>
            Download .md
          </Button>
        </>
      }
    >
      {doc.isError ? <Alert tone="danger">{errorMessage(doc.error)}</Alert> : null}
      {refreshDoc.isError ? <Alert tone="danger">{errorMessage(refreshDoc.error)}</Alert> : null}
      {doc.isLoading ? <p className="muted">Loading…</p> : null}
      {markdown ? <div className="project-doc">{renderMarkdown(markdown)}</div> : null}
      {!doc.isLoading && !markdown ? (
        <p className="muted">
          {data?.refreshing
            ? 'Writing the project file from the Summary…'
            : 'The file is written once the Summary has work in it.'}
        </p>
      ) : null}
    </Modal>
  );
}

function describe(data: ReturnType<typeof useProjectDocQuery>['data']): string {
  if (!data?.generatedAt) return 'Features, structure and flow of this project.';
  const when = new Date(data.generatedAt).toLocaleString();
  const by = data.generatedBy === 'AI' ? 'AI' : 'the Summary outline';
  return `Written by ${by} · ${when}${data.stale ? ' · updating soon' : ''}`;
}

/** Small, safe Markdown view: headings, lists, quotes, code blocks, bold, italic and code. */
export function renderMarkdown(markdown: string): ReactNode[] {
  const out: ReactNode[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let list = null as { ordered: boolean; items: string[] } | null;
  let paragraph: string[] = [];
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(<p key={out.length}>{inline(paragraph.join(' '))}</p>);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((item, i) => <li key={i}>{inline(item)}</li>);
      out.push(
        list.ordered ? <ol key={out.length}>{items}</ol> : <ul key={out.length}>{items}</ul>,
      );
      list = null;
    }
  };

  for (const raw of lines) {
    if (code) {
      if (raw.trim().startsWith('```')) {
        out.push(
          <pre key={out.length}>
            <code>{code.join('\n')}</code>
          </pre>,
        );
        code = null;
      } else {
        code.push(raw);
      }
      continue;
    }
    const line = raw.trimEnd();
    if (line.trim().startsWith('```')) {
      flushParagraph();
      flushList();
      code = [];
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      out.push(headingNode(heading[1]?.length ?? 1, inline(heading[2] ?? ''), out.length));
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)?.[1];
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)?.[1];
    const item = bullet ?? numbered;
    if (item !== undefined) {
      flushParagraph();
      const ordered = bullet === undefined;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(item);
      continue;
    }
    if (line.startsWith('>')) {
      flushParagraph();
      flushList();
      out.push(<blockquote key={out.length}>{inline(line.replace(/^>\s?/, ''))}</blockquote>);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushParagraph();
      flushList();
      out.push(<hr key={out.length} />);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  if (code) {
    out.push(
      <pre key={out.length}>
        <code>{(code as string[]).join('\n')}</code>
      </pre>,
    );
  }
  flushParagraph();
  flushList();
  return out;
}

function headingNode(level: number, text: ReactNode, key: number): ReactNode {
  if (level === 1) return <h2 key={key}>{text}</h2>;
  if (level === 2) return <h3 key={key}>{text}</h3>;
  return <h4 key={key}>{text}</h4>;
}

function inline(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 3) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
