import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { ReleaseNoteItemKind, ReleaseNoteStatus } from '@ashniva/types';

import {
  reportingPeriod,
  selectDraftItems,
  type ReportingPeriod,
  type SelectedItem,
} from './draft-selection';
import { isRegenerable } from './release-note-workflow';
import { ReleaseNotesRepository, type ReleaseNoteDetailRow } from './release-notes.repository';

export interface GenerateOptions {
  periodStart?: string;
  periodEnd?: string;
  defaultDays?: number;
}

/**
 * Turning completed work into a draft.
 *
 * Separate from `ReleaseNotesService` because it is the one part of the feature that reads
 * outside its own tables — tasks, tickets, client updates and code activity — and the rules for
 * what it may read are worth keeping in one small file rather than buried in CRUD.
 */
@Injectable()
export class ReleaseNoteGeneratorService {
  constructor(private readonly repository: ReleaseNotesRepository) {}

  /**
   * Fills the draft from the work done in the reporting period.
   *
   * Safe to run repeatedly: `selectDraftItems` skips anything already on the note, so a second
   * run adds only what is new and never disturbs a manual line or an edited label. The unique
   * index on (note, kind, refId, externalRef) is the backstop if two runs race.
   */
  async generate(
    current: ReleaseNoteDetailRow,
    options: GenerateOptions = {},
  ): Promise<ReleaseNoteDetailRow> {
    if (!isRegenerable(current.status as ReleaseNoteStatus)) {
      throw new ConflictException(`A release note that is ${current.status} cannot be regenerated`);
    }

    const period = await this.resolvePeriod(current, options);
    const candidates = await this.repository.collectCandidates(
      current.organizationId,
      current.projectId,
      period.start,
      period.end,
    );
    const selected = selectDraftItems(
      candidates,
      current.items.map((item) => ({
        kind: item.kind as ReleaseNoteItemKind,
        refId: item.refId,
        externalRef: item.externalRef,
      })),
    );

    if (selected.length > 0) {
      await this.repository.addItems(current.id, selected.map(toCreateItem));
    }

    return this.repository.update(current.id, {
      generatedAt: new Date(),
      periodStart: period.start,
      periodEnd: period.end,
    });
  }

  private async resolvePeriod(
    row: ReleaseNoteDetailRow,
    options: GenerateOptions,
  ): Promise<ReportingPeriod> {
    if (options.periodStart && options.periodEnd) {
      const start = new Date(options.periodStart);
      const end = new Date(options.periodEnd);
      // Supplied as an inclusive end but queried as exclusive, so the whole end day counts.
      end.setUTCDate(end.getUTCDate() + 1);
      if (start >= end) {
        throw new BadRequestException('periodStart must be before periodEnd');
      }
      return { start, end };
    }

    const previous = await this.repository.lastPublishedAt(row.organizationId, row.projectId);
    return reportingPeriod(row.releaseDate, previous, options.defaultDays ?? 30);
  }
}

function toCreateItem(item: SelectedItem) {
  return {
    kind: item.kind,
    source: 'GENERATED' as const,
    refId: item.refId,
    externalRef: item.externalRef,
    label: item.label,
    clientLabel: null,
    clientVisible: item.clientVisible,
    sortOrder: item.sortOrder,
  };
}
