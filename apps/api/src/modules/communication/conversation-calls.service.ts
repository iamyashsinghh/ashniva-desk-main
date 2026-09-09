import { BadRequestException, Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  CALL_STATUS,
  COMMUNICATION_ACTION,
  COMMUNICATION_REFUSAL,
  COMMUNICATION_REFUSAL_LABELS,
  CONVERSATION_KIND,
  MESSAGE_SYSTEM_KIND,
  isCallTerminal,
  shouldRecord,
  type AuthenticatedUser,
  type CallStatus,
  type ConversationCallSummary,
} from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { CallLogsRepository, type CallRow } from '../call-logs/call-logs.repository';
import {
  InternalCallAdvancerRegistry,
  type InternalCallAdvancer,
} from '../call-logs/internal-call-advancer';
import { IvrConnectionService } from '../ivr/ivr-connection.service';
import {
  IVR_PROVIDER,
  type IvrProvider,
  UNCONFIGURED_IVR_ACCOUNT,
} from '../ivr/ivr-provider.interface';
import { CommunicationNotificationsService } from './communication-notifications.service';
import { CommunicationPolicyService } from './communication-policy.service';
import { CommunicationRealtimeService } from './communication-realtime.service';
import { CommunicationSettingsService } from './communication-settings.service';
import { ConversationCallHistoryService } from './conversation-call-history.service';
import { ConversationsRepository, type ConversationRow } from './conversations.repository';
import { ConversationsService } from './conversations.service';
import type { StartConversationCallDto } from './dto/communication.dto';
import { InternalCallRoutingService } from './internal-call-routing.service';
import { MessagesService } from './messages.service';

/**
 * Calling somebody from a conversation.
 *
 * Everything mechanical is package 9's: the provider adapter, the call log, the attempt rows, the
 * lifecycle graph, the webhook correlation, the recording reference. There is one IVR integration
 * in this product and this is not a second one.
 *
 * What belongs here is the part package 9 must not decide — **who an internal call reaches**.
 * `InternalCallRoutingService` answers that, and its answer is short: the person the call is for.
 * The support chain is not consulted, cannot be reached from here, and would be the wrong answer
 * if it were.
 *
 * The call also becomes part of the thread. A system message marks it starting and ending, which
 * is what stops a call being a separate history nobody opens.
 */
@Injectable()
export class ConversationCallsService implements InternalCallAdvancer, OnModuleInit {
  constructor(
    private readonly conversations: ConversationsRepository,
    private readonly conversationsService: ConversationsService,
    private readonly calls: CallLogsRepository,
    private readonly callHistory: ConversationCallHistoryService,
    private readonly routing: InternalCallRoutingService,
    private readonly settings: CommunicationSettingsService,
    private readonly policy: CommunicationPolicyService,
    private readonly messages: MessagesService,
    private readonly notifications: CommunicationNotificationsService,
    private readonly realtime: CommunicationRealtimeService,
    private readonly connections: IvrConnectionService,
    private readonly registry: InternalCallAdvancerRegistry,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly logger: PinoLogger,
    @Inject(IVR_PROVIDER) private readonly provider: IvrProvider,
  ) {
    this.logger.setContext(ConversationCallsService.name);
  }

  onModuleInit(): void {
    // See `internal-call-advancer.ts`: package 9 hands internal calls back here rather than
    // walking the support chain, and cannot import this module to do it.
    this.registry.register(this);
  }

  async start(
    actor: AuthenticatedUser,
    conversationId: string,
    dto: StartConversationCallDto,
  ): Promise<ConversationCallSummary> {
    const row = await this.conversationsService.load(actor, conversationId);
    if (row.projectId === null) {
      // Telephony stays project-anchored. Everything an internal call needs comes from a project —
      // the fallback destination, the recording playback scope and the roles that decide it — and
      // a scope conversation has none. Refused explicitly rather than left to fail somewhere
      // downstream with a null the router would have to guess about.
      //
      // `canCommunicate` says the same thing for the same case, and the sentence comes from the
      // shared label so this refusal and `abilities.canCall` cannot drift apart into two
      // different answers to one question.
      throw new BadRequestException(
        COMMUNICATION_REFUSAL_LABELS[COMMUNICATION_REFUSAL.CALL_NEEDS_PROJECT],
      );
    }
    const target = await this.resolveTarget(actor, row, dto.withUserId);

    // Checked against the *counterpart*, not just the conversation: ringing somebody's telephone
    // from a project channel still needs the pairing that a direct conversation with them needs.
    await this.policy.require(actor, COMMUNICATION_ACTION.CALL, {
      projectId: row.projectId,
      taskId: row.taskId,
      ticketId: row.ticketId,
      withUserId: target,
    });

    const flags = await this.settings.flagsFor(actor.organizationId);
    const call = await this.calls.create({
      organizationId: actor.organizationId,
      kind: 'INTERNAL',
      conversationId: row.id,
      projectId: row.projectId,
      taskId: row.taskId,
      ticketId: row.ticketId,
      providerKey: this.provider.key,
      status: CALL_STATUS.REQUESTED,
      initiatedById: actor.userId,
      recordingConsent: shouldRecord(flags.recordingPolicy, dto.recordingConsent ?? false),
      // One destination, or two when the organization allows the project lead to be tried. There
      // is no configuration that reaches further.
      maxAttempts: flags.internalCallFallback === 'NONE' ? 1 : 2,
    });

    await this.prisma.callParticipant.createMany({
      data: [
        {
          callId: call.id,
          organizationId: actor.organizationId,
          userId: actor.userId,
          isInitiator: true,
        },
        { callId: call.id, organizationId: actor.organizationId, userId: target },
      ],
      skipDuplicates: true,
    });

    await this.audit(actor.organizationId, AUDIT_ACTION.CALL_INITIATED, call, {
      conversationId: row.id,
      projectId: row.projectId,
      targetUserId: target,
      actorUserId: actor.userId,
      recordingConsent: call.recordingConsent,
    });

    await this.advance(actor.organizationId, call.id, target);
    return this.callHistory.one(actor, call.id);
  }

  /**
   * Ring the next destination, or end the call and tell the person who started it.
   *
   * Called at initiation and again by package 9's event handling when a destination does not
   * answer. Never routes onward to anybody the caller could not have called directly.
   */
  async advance(organizationId: string, callId: string, intended?: string): Promise<void> {
    const call = await this.calls.find(organizationId, callId);
    if (!call || isCallTerminal(call.status as CallStatus) || !call.conversationId) {
      return;
    }
    const row = await this.conversations.find(organizationId, call.conversationId);
    if (!row) {
      await this.giveUp(call, row, 'The conversation is no longer available');
      return;
    }

    const intendedUserId = intended ?? (await this.intendedOf(call));
    if (!intendedUserId) {
      await this.giveUp(call, row, 'This call has no destination');
      return;
    }

    const flags = await this.settings.flagsFor(organizationId);
    const tried = await this.calls.triedTargets(call.id);
    if (call.attemptCount >= call.maxAttempts) {
      await this.giveUp(call, row, 'Nobody answered');
      return;
    }

    const decision = await this.routing.next(
      organizationId,
      call.projectId as string,
      intendedUserId,
      flags.internalCallFallback,
      tried,
    );
    if (!decision.userId) {
      await this.giveUp(call, row, decision.reason);
      return;
    }

    const sequence = await this.calls.claimAttempt(call.id, call.attemptCount);
    if (sequence === null) {
      // Somebody else is already ringing for this call. Two destinations at once is worse.
      return;
    }
    const attempt = await this.calls.recordAttempt({
      organizationId,
      callId: call.id,
      sequence,
      step: sequence === 1 ? 'ASSIGNED_OWNER' : 'ESCALATION',
      targetUserId: decision.userId,
      status: CALL_STATUS.RINGING,
      reason: decision.reason,
    });

    try {
      const account = await this.connections.account(organizationId);
      const result = await this.provider.startOutboundCall({
        organizationId,
        // The conversation stands in for the ticket here: an internal call is about a thread, and
        // the adapter needs a stable reference rather than a ticket specifically.
        ticketId: call.ticketId ?? call.conversationId,
        agentUserId: decision.userId,
        // No number crosses this boundary for an internal call either — the IVR bridges the two
        // staff legs from its own directory.
        clientPhoneRef: '',
        recordingConsent: call.recordingConsent,
        account: account ?? UNCONFIGURED_IVR_ACCOUNT,
      });
      const updated = await this.calls.update(call.id, {
        providerCallId: result.providerCallId,
        status: CALL_STATUS.RINGING,
        ringingAt: result.startedAt,
        lastError: null,
      });
      await this.calls.finishAttempt(attempt.id, { providerCallId: result.providerCallId });
      await this.audit(organizationId, AUDIT_ACTION.CALL_TARGET_CHOSEN, updated, {
        conversationId: row.id,
        attempt: sequence,
        targetUserId: decision.userId,
        reason: decision.reason,
      });
      await this.announce(row, MESSAGE_SYSTEM_KIND.CALL_STARTED, 'A call was started');
      await this.notifications.incomingCall(
        row,
        decision.userId,
        call.id,
        call.initiatedBy?.name ?? 'A colleague',
      );
    } catch (error) {
      // Short and generic on purpose: a provider error can quote the request it failed on.
      const message = error instanceof Error ? error.name : 'The provider refused the call';
      this.logger.warn({ callId: call.id, err: error }, 'An internal call could not be placed');
      await this.calls.finishAttempt(attempt.id, {
        status: CALL_STATUS.FAILED,
        endedAt: new Date(),
      });
      await this.calls.update(call.id, { lastError: message });
      await this.advance(organizationId, call.id, intendedUserId);
    }
  }

  /** Who this call is for, from the participant rows. */
  private async intendedOf(call: CallRow): Promise<string | null> {
    const participant = await this.prisma.callParticipant.findFirst({
      where: { callId: call.id, isInitiator: false },
      select: { userId: true },
    });
    return participant?.userId ?? null;
  }

  private async resolveTarget(
    actor: AuthenticatedUser,
    row: ConversationRow,
    requested: string | undefined,
  ): Promise<string> {
    if (row.kind === CONVERSATION_KIND.DIRECT) {
      const other = row.members.find((member) => member.userId !== actor.userId)?.userId;
      if (!other) {
        throw new BadRequestException('This conversation has nobody to call');
      }
      return other;
    }
    if (!requested || requested === actor.userId) {
      // A project, task or ticket thread has many people in it. Ringing "the conversation" would
      // mean Desk choosing whose telephone rings, which is the caller's decision to make.
      throw new BadRequestException('Choose who to call');
    }
    return requested;
  }

  private async giveUp(call: CallRow, row: ConversationRow | null, reason: string): Promise<void> {
    if (isCallTerminal(call.status as CallStatus)) {
      return;
    }
    const status = call.attemptCount > 0 ? CALL_STATUS.NO_ANSWER : CALL_STATUS.FAILED;
    const updated = await this.calls.update(call.id, {
      status,
      queueReason: reason,
      endedAt: new Date(),
    });
    await this.audit(call.organizationId, AUDIT_ACTION.CALL_COMPLETED, updated, {
      conversationId: call.conversationId,
      status,
      reason,
    });
    if (row) {
      await this.announce(row, MESSAGE_SYSTEM_KIND.CALL_ENDED, `Call ended — ${reason}`);
      if (call.initiatedById) {
        // The person who started it, not a support queue. An internal call that fails is theirs
        // to follow up; telling anybody else would be the disclosure this package avoids.
        await this.notifications.missedCall(row, call.initiatedById, call.id, reason);
      }
    }
  }

  private async announce(
    row: ConversationRow,
    kind: (typeof MESSAGE_SYSTEM_KIND)[keyof typeof MESSAGE_SYSTEM_KIND],
    body: string,
  ): Promise<void> {
    await this.messages.writeSystemMessage(row, kind, body);
  }

  private audit(
    organizationId: string,
    action: string,
    call: CallRow,
    after: Record<string, unknown>,
  ): Promise<void> {
    return this.auditLog.record({
      action,
      entityType: AUDIT_ENTITY_TYPE.CALL,
      entityId: call.id,
      organizationId,
      after,
    });
  }
}
