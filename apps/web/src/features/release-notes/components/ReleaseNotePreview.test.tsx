import type { ReleaseNoteDetail } from '@ashniva/types';
import { render, screen } from '@testing-library/react';

import { ReleaseNotePreview } from './ReleaseNotePreview';

/**
 * The preview is what a reviewer approves on. If it showed a line the client will not get — or
 * hid one they will — the approval would be for a different document than the one published.
 */

const note = (overrides: Partial<ReleaseNoteDetail> = {}): ReleaseNoteDetail => ({
  id: 'note-1',
  projectId: 'proj-1',
  projectCode: 'ACME',
  clientOrganizationId: 'org-client',
  version: '2026.09.1',
  releaseDate: '2026-09-30',
  status: 'IN_REVIEW',
  itemCount: 2,
  publishedAt: null,
  updatedAt: '2026-09-29T10:00:00.000Z',
  periodStart: '2026-09-01',
  periodEnd: '2026-10-01',
  internalNotes: 'Rushed after the client escalated',
  clientSummary: 'September improvements.',
  generatedAt: '2026-09-29T09:00:00.000Z',
  createdAt: '2026-09-29T08:00:00.000Z',
  history: [],
  items: [
    {
      id: 'item-1',
      kind: 'TASK',
      source: 'GENERATED',
      refId: 'task-1',
      externalRef: null,
      label: 'Checkout total fixed',
      clientLabel: null,
      clientVisible: true,
      sortOrder: 0,
    },
    {
      id: 'item-2',
      kind: 'CODE_ACTIVITY',
      source: 'GENERATED',
      refId: null,
      externalRef: 'pr-42',
      label: 'Dropped the legacy VAT hack',
      clientLabel: null,
      clientVisible: false,
      sortOrder: 10,
    },
  ],
  ...overrides,
});

describe('ReleaseNotePreview', () => {
  it('shows the lines the client will read', () => {
    render(<ReleaseNotePreview note={note()} />);
    expect(screen.getByText('Checkout total fixed')).toBeInTheDocument();
    expect(screen.getByText('September improvements.')).toBeInTheDocument();
  });

  it('leaves out a line marked internal', () => {
    render(<ReleaseNotePreview note={note()} />);
    expect(screen.queryByText('Dropped the legacy VAT hack')).not.toBeInTheDocument();
  });

  it('says how many internal lines were withheld, so nothing looks lost', () => {
    render(<ReleaseNotePreview note={note()} />);
    expect(screen.getByText(/1 internal line\(s\) are hidden/)).toBeInTheDocument();
  });

  it('never shows the internal notes', () => {
    const { container } = render(<ReleaseNotePreview note={note()} />);
    expect(container.textContent).not.toContain('escalated');
  });

  it('prefers the rewritten client wording', () => {
    const source = note();
    render(
      <ReleaseNotePreview
        note={{
          ...source,
          items: source.items.map((item) =>
            item.id === 'item-1'
              ? { ...item, clientLabel: 'Order totals now include shipping' }
              : item,
          ),
        }}
      />,
    );
    expect(screen.getByText('Order totals now include shipping')).toBeInTheDocument();
    expect(screen.queryByText('Checkout total fixed')).not.toBeInTheDocument();
  });

  it('warns when there is nothing publishable', () => {
    const source = note();
    render(
      <ReleaseNotePreview
        note={{
          ...source,
          items: source.items.map((item) => ({ ...item, clientVisible: false })),
        }}
      />,
    );
    expect(screen.getByText(/cannot be published/)).toBeInTheDocument();
  });
});
