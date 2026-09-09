import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '@ashniva/types';

import {
  ReleaseNotesRepository,
  type ReleaseNoteDetailRow,
  type ReleaseNoteSummaryRow,
} from './release-notes.repository';

/**
 * Release-note reads for a client.
 *
 * Kept apart from `ReleaseNotesService` rather than added to it as two more methods. Everything
 * in this class scopes by `clientOrganizationId` and returns only published notes; everything in
 * the internal service scopes by `organizationId` and returns any status. Keeping the two sets of
 * rules in separate files means a change to one cannot quietly widen the other, and there is no
 * shared "should this be filtered" parameter to get wrong.
 */
@Injectable()
export class PortalReleaseNotesService {
  constructor(private readonly repository: ReleaseNotesRepository) {}

  list(
    actor: AuthenticatedUser,
    query: { projectId?: string; limit?: number; cursor?: string },
  ): Promise<{ items: ReleaseNoteSummaryRow[]; nextCursor: string | null; total: number }> {
    return this.repository.listForClient({
      clientOrganizationId: actor.organizationId,
      projectId: query.projectId,
      limit: query.limit ?? 25,
      cursor: query.cursor,
    });
  }

  async detail(actor: AuthenticatedUser, id: string): Promise<ReleaseNoteDetailRow> {
    const row = await this.repository.findPublishedForClient(actor.organizationId, id);
    if (!row) {
      // Deliberately the same answer for "does not exist", "belongs to another client" and
      // "exists but is still a draft": the client learns nothing either way.
      throw new NotFoundException('Release note not found');
    }
    return row;
  }
}
