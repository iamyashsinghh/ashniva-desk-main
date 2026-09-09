import { RELEASE_NOTE_ITEM_KIND_LABELS, type ReleaseNoteItemKind } from '@ashniva/types';

/**
 * The release-note PDF.
 *
 * Split the same way the invoice PDF is, and for the same reason: `releaseNoteDocument` decides
 * *what the client is shown* and is a pure function that can be tested exhaustively, while
 * `renderReleaseNoteDocument` only decides where it goes on the page. The interesting failure
 * here is not a layout one — it is an internal note or a hidden item reaching a client — and that
 * failure lives entirely in the first function.
 */

export const MARGIN = 48;
const PAGE_WIDTH = 595.28; // A4 at 72dpi
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** A row as the client will read it. */
export interface DocumentItem {
  kind: ReleaseNoteItemKind;
  kindLabel: string;
  /** The client wording where one was written, the internal label otherwise. */
  label: string;
}

export interface ReleaseNoteDocument {
  projectCode: string;
  version: string;
  releaseDate: string;
  summary: string | null;
  /** Grouped by kind, in the order the kinds are declared, each group already sorted. */
  groups: { kindLabel: string; items: DocumentItem[] }[];
  itemCount: number;
}

/** The note as it reaches the page, with everything a client may not see already gone. */
export interface RenderableNote {
  projectCode: string;
  version: string;
  releaseDate: Date;
  clientSummary: string | null;
  /** Deliberately *not* `internalNotes`: this type has no field for it, so none can be passed. */
  items: {
    kind: string;
    label: string;
    clientLabel: string | null;
    clientVisible: boolean;
    sortOrder: number;
  }[];
}

/**
 * Turns a release note into what a client is shown.
 *
 * Three rules, and each is the answer to a way this could leak:
 *
 *  * an item that is not `clientVisible` is dropped — the flag exists precisely so a team can
 *    record an internal change on the same note;
 *  * `clientLabel` wins over `label` where one was written, because the internal label is how the
 *    team describes the change to itself;
 *  * `internalNotes` has no route here at all. `RenderableNote` has no field for it, so omitting
 *    it is not something a caller has to remember.
 */
export function releaseNoteDocument(note: RenderableNote): ReleaseNoteDocument {
  const visible = note.items
    .filter((item) => item.clientVisible)
    .map((item) => ({
      kind: item.kind as ReleaseNoteItemKind,
      kindLabel: kindLabel(item.kind),
      label: (item.clientLabel?.trim() || item.label).trim(),
      sortOrder: item.sortOrder,
    }))
    .filter((item) => item.label.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const groups: ReleaseNoteDocument['groups'] = [];
  for (const item of visible) {
    const existing = groups.find((group) => group.kindLabel === item.kindLabel);
    const row: DocumentItem = { kind: item.kind, kindLabel: item.kindLabel, label: item.label };
    if (existing) {
      existing.items.push(row);
    } else {
      groups.push({ kindLabel: item.kindLabel, items: [row] });
    }
  }

  return {
    projectCode: note.projectCode,
    version: note.version,
    releaseDate: note.releaseDate.toISOString().slice(0, 10),
    summary: note.clientSummary?.trim() || null,
    groups,
    itemCount: visible.length,
  };
}

function kindLabel(kind: string): string {
  const labels = RELEASE_NOTE_ITEM_KIND_LABELS as Record<string, string | undefined>;
  return labels[kind] ?? kind;
}

/**
 * Draws the document.
 *
 * Every block is given an explicit `width`, so pdfkit wraps long text rather than running it off
 * the page — the failure the invoice tables had to be measured out of twice. Heights are never
 * assumed: the cursor is read back after each block, and a new page is started when the next one
 * would not fit.
 */
export function renderReleaseNoteDocument(
  doc: PDFKit.PDFDocument,
  document: ReleaseNoteDocument,
): void {
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000');
  doc.text(`Release notes ${document.version}`, MARGIN, MARGIN, { width: CONTENT_WIDTH });

  doc.moveDown(0.3).fontSize(10).font('Helvetica').fillColor('#444444');
  doc.text(`${document.projectCode} · released ${document.releaseDate}`, { width: CONTENT_WIDTH });

  if (document.summary) {
    doc.moveDown(1).fontSize(11).font('Helvetica').fillColor('#000000');
    doc.text(document.summary, { width: CONTENT_WIDTH, align: 'left' });
  }

  if (document.groups.length === 0) {
    doc.moveDown(1.5).fontSize(10).font('Helvetica-Oblique').fillColor('#444444');
    doc.text('No client-visible changes were recorded for this release.', {
      width: CONTENT_WIDTH,
    });
    return;
  }

  for (const group of document.groups) {
    breakIfNeeded(doc, 60);
    doc.moveDown(1).fontSize(12).font('Helvetica-Bold').fillColor('#000000');
    doc.text(group.kindLabel, { width: CONTENT_WIDTH });
    doc.moveDown(0.2);

    for (const item of group.items) {
      breakIfNeeded(doc, 40);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      // The bullet and the text are drawn separately so a wrapped line aligns under the text
      // rather than under the bullet.
      const top = doc.y;
      doc.text('•', MARGIN, top, { width: 10 });
      doc.text(item.label, MARGIN + 14, top, { width: CONTENT_WIDTH - 14 });
      doc.moveDown(0.25);
    }
  }
}

/** Starts a page when the next block would not fit on this one. */
function breakIfNeeded(doc: PDFKit.PDFDocument, needed: number): void {
  const bottom = doc.page.height - MARGIN;
  if (doc.y + needed > bottom) {
    doc.addPage();
  }
}
