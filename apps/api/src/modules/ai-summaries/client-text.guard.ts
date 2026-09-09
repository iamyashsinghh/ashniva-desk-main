import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { AiSummaryType } from '@ashniva/types';

import { LeakageBaselineService } from './leakage-baseline.service';
import { findLeakage } from './output-guard';

/**
 * Deciding whether generated text may be stored as the client version.
 *
 * Its own class because it answers one question, and the answer is the module's whole point: the
 * check runs even though internal records were never put in the prompt. That is deliberate — it
 * is an assertion about the output, not a hope about the input.
 */
export interface ClientTextDecision {
  clientContent: string | null;
  leakageNote: string | null;
}

export interface ClientTextScope {
  summaryId: string;
  organizationId: string;
  type: AiSummaryType;
  clientOrganizationId: string | null;
  projectId: string | null;
  periodStart: Date;
  /** Exclusive. */
  periodEnd: Date;
}

@Injectable()
export class ClientTextGuard {
  constructor(
    private readonly baseline: LeakageBaselineService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClientTextGuard.name);
  }

  async decide(scope: ClientTextScope, text: string): Promise<ClientTextDecision> {
    const [internalTexts, otherClients] = await Promise.all([
      this.baseline.internalTextsFor({
        organizationId: scope.organizationId,
        type: scope.type,
        projectId: scope.projectId,
        subjectUserId: null,
        ticketId: null,
        periodStart: scope.periodStart,
        periodEnd: scope.periodEnd,
      }),
      this.baseline.otherClientNames(scope.organizationId, scope.clientOrganizationId),
    ]);

    const findings = findLeakage({ text, internalTexts, otherClientNames: otherClients });
    if (findings.length === 0) {
      return { clientContent: text, leakageNote: null };
    }

    const kinds = [...new Set(findings.map((finding) => finding.kind))].join(', ');
    this.logger.warn(
      { summaryId: scope.summaryId, kinds },
      'Generated client text was withheld: it contained internal material',
    );
    return {
      clientContent: null,
      leakageNote: `The generated client version was withheld because it contained internal material (${kinds}). The internal version is below; write the client version by hand.`,
    };
  }
}
