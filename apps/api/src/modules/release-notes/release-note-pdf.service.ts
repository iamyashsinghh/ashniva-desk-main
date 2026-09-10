import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { RELEASE_NOTE_STATUS, type AuthenticatedUser } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  MARGIN,
  releaseNoteDocument,
  renderReleaseNoteDocument,
  type RenderableNote,
} from './release-note-pdf-layout';

/**
 * `GET /releases/:id/notes.pdf`, specified in `docs/api-plan.md` under work package 6.
 *
 * The route lives with releases, which owns the deployment record the client asked about; the
 * layout lives here, with the module that owns the content. That was the open question when this
 * was deferred, and `Release.releaseNoteId` settles it — a release points at the note it shipped.
 *
 * **Only a published note.** A draft is the team still deciding what to say. Rendering one would
 * hand a client wording nobody approved, so an unpublished note is refused rather than rendered
 * with a watermark.
 */
@Injectable()
export class ReleaseNotePdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Renders the note a release shipped and stores it, returning the file row's id.
   *
   * Tenant-scoped on the way in: the release must belong to the caller's organization, and the
   * note is reached through the release rather than by an id the caller supplied, so there is no
   * pair of ids to mismatch.
   */
  async generateForRelease(actor: AuthenticatedUser, releaseId: string): Promise<string> {
    const release = await this.prisma.release.findFirst({
      where: { id: releaseId, organizationId: actor.organizationId, deletedAt: null },
      select: { id: true, releaseNoteId: true, organizationId: true },
    });
    if (!release) {
      throw new NotFoundException('Release not found');
    }
    if (!release.releaseNoteId) {
      throw new NotFoundException('This release has no release note');
    }

    const note = await this.prisma.releaseNote.findFirst({
      where: { id: release.releaseNoteId, organizationId: actor.organizationId },
      include: {
        project: { select: { code: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!note) {
      throw new NotFoundException('This release has no release note');
    }
    if (note.status !== RELEASE_NOTE_STATUS.PUBLISHED) {
      throw new ForbiddenException('This release note has not been published yet');
    }

    // Deliberately narrowed to `RenderableNote`, which has no `internalNotes` field. The internal
    // notes are on the row above and simply have nowhere to go from here.
    const renderable: RenderableNote = {
      projectCode: note.project.code,
      version: note.version,
      releaseDate: note.releaseDate,
      clientSummary: note.clientSummary,
      items: note.items.map((item) => ({
        kind: item.kind,
        label: item.label,
        clientLabel: item.clientLabel,
        clientVisible: item.clientVisible,
        sortOrder: item.sortOrder,
      })),
    };

    const bytes = await this.render(renderable);
    const storageKey = `release-notes/${note.organizationId}/${note.id}/${randomUUID()}.pdf`;
    await this.storage.putObject({
      key: storageKey,
      body: bytes,
      contentType: 'application/pdf',
    });

    const file = await this.prisma.file.create({
      data: {
        organizationId: note.organizationId,
        name: `release-notes-${note.version.replaceAll('/', '-')}.pdf`,
        contentType: 'application/pdf',
        sizeBytes: bytes.length,
        storageKey,
        // The client is the audience, so the file is client-visible — and it contains only what
        // `releaseNoteDocument` admits.
        visibility: 'CLIENT',
        uploadedById: actor.userId,
      },
    });

    return file.id;
  }

  /** Builds the document in memory. Separate so a test can render without storage. */
  render(note: RenderableNote): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        renderReleaseNoteDocument(doc, releaseNoteDocument(note));
        doc.end();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
}
