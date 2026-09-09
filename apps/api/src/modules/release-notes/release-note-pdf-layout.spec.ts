import { releaseNoteDocument, type RenderableNote } from './release-note-pdf-layout';

/**
 * Issue #19: the release-note PDF.
 *
 * The interesting failure in this document is not a layout one — it is a client reading something
 * that was never meant for them. That decision is `releaseNoteDocument`, a pure function, so it is
 * tested here rather than by rendering a PDF and trying to read the text back out.
 */

function note(over: Partial<RenderableNote> = {}): RenderableNote {
  return {
    projectCode: 'ACM',
    version: '2026.09.1',
    releaseDate: new Date('2026-09-14T00:00:00.000Z'),
    clientSummary: 'Faster search and two fixes.',
    items: [
      {
        kind: 'FEATURE',
        label: 'Rewrote the search indexer (ACM-411)',
        clientLabel: 'Search is now noticeably faster',
        clientVisible: true,
        sortOrder: 1,
      },
      {
        kind: 'FIX',
        label: 'Fixed the export crash',
        clientLabel: null,
        clientVisible: true,
        sortOrder: 2,
      },
      {
        kind: 'CHORE',
        label: 'Rotated the staging database credentials',
        clientLabel: null,
        clientVisible: false,
        sortOrder: 3,
      },
    ],
    ...over,
  };
}

describe('releaseNoteDocument — what the client is shown', () => {
  it('keeps the client wording where one was written', () => {
    const document = releaseNoteDocument(note());
    const labels = document.groups.flatMap((group) => group.items.map((item) => item.label));

    expect(labels).toContain('Search is now noticeably faster');
    // The internal label is how the team describes the change to itself, ticket number and all.
    expect(labels).not.toContain('Rewrote the search indexer (ACM-411)');
  });

  it('falls back to the internal label only when no client wording exists', () => {
    const labels = releaseNoteDocument(note()).groups.flatMap((group) =>
      group.items.map((item) => item.label),
    );
    expect(labels).toContain('Fixed the export crash');
  });

  it('drops an item that is not client-visible', () => {
    const document = releaseNoteDocument(note());
    const labels = JSON.stringify(document);

    expect(labels).not.toContain('Rotated the staging database credentials');
    expect(document.itemCount).toBe(2);
  });

  it('has nowhere to put internal notes, by construction', () => {
    // `RenderableNote` has no `internalNotes` field, so this is a type-level guarantee rather
    // than a filter somebody has to remember. Asserted as a runtime fact too: passing one
    // through anyway does not reach the document.
    const smuggled = { ...note(), internalNotes: 'Do not tell the client we missed the deadline' };
    const document = releaseNoteDocument(smuggled as RenderableNote);

    expect(JSON.stringify(document)).not.toContain('missed the deadline');
  });

  it('groups by kind and orders within a group by the stored order', () => {
    const document = releaseNoteDocument(
      note({
        items: [
          {
            kind: 'FIX',
            label: 'Second fix',
            clientLabel: null,
            clientVisible: true,
            sortOrder: 2,
          },
          { kind: 'FIX', label: 'First fix', clientLabel: null, clientVisible: true, sortOrder: 1 },
        ],
      }),
    );

    expect(document.groups).toHaveLength(1);
    expect(document.groups[0]?.items.map((item) => item.label)).toEqual([
      'First fix',
      'Second fix',
    ]);
  });

  it('drops an item whose only label is blank rather than printing an empty bullet', () => {
    const document = releaseNoteDocument(
      note({
        items: [
          { kind: 'FIX', label: '   ', clientLabel: '  ', clientVisible: true, sortOrder: 1 },
        ],
      }),
    );
    expect(document.itemCount).toBe(0);
  });

  it('says so plainly when a release has nothing the client may see', () => {
    const document = releaseNoteDocument(
      note({
        items: [
          {
            kind: 'CHORE',
            label: 'Internal only',
            clientLabel: null,
            clientVisible: false,
            sortOrder: 1,
          },
        ],
      }),
    );
    expect(document.groups).toEqual([]);
    expect(document.itemCount).toBe(0);
  });
});
