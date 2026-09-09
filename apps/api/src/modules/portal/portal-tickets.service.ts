import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  VISIBILITY,
  type AuthenticatedUser,
  type CommentSummary,
  type PaginatedResponse,
  type PortalTicketDetail,
  type PortalTicketSummary,
} from '@ashniva/types';

import { isClientUser } from '../../common/auth/access-scope';
import type {
  CreateTicketDto,
  ListTicketsQueryDto,
  TicketCommentDto,
} from '../tickets/dto/ticket.dto';
import { TicketTransitionsService } from '../tickets/ticket-transitions.service';
import { TicketsService } from '../tickets/tickets.service';
import { toPortalTicket, toPortalTicketDetail } from './portal.mapper';

/** Client-side ticket desk: the same ticket services, projected through the portal mappers. */
@Injectable()
export class PortalTicketsService {
  constructor(
    private readonly tickets: TicketsService,
    private readonly transitions: TicketTransitionsService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: ListTicketsQueryDto,
  ): Promise<PaginatedResponse<PortalTicketSummary>> {
    this.assertClient(actor);
    const page = await this.tickets.list(actor, query);
    return { ...page, items: page.items.map(toPortalTicket) };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<PortalTicketDetail> {
    this.assertClient(actor);
    return toPortalTicketDetail(await this.tickets.get(actor, id));
  }

  async raise(actor: AuthenticatedUser, dto: CreateTicketDto): Promise<PortalTicketDetail> {
    this.assertClient(actor);
    return toPortalTicketDetail(await this.tickets.create(actor, dto));
  }

  async reply(
    actor: AuthenticatedUser,
    id: string,
    dto: TicketCommentDto,
  ): Promise<CommentSummary> {
    this.assertClient(actor);
    return this.tickets.addComment(actor, id, { body: dto.body, visibility: VISIBILITY.CLIENT });
  }

  async close(actor: AuthenticatedUser, id: string): Promise<PortalTicketDetail> {
    this.assertClient(actor);
    return toPortalTicketDetail(await this.transitions.close(actor, id, 'Confirmed by the client'));
  }

  async reopen(actor: AuthenticatedUser, id: string, reason: string): Promise<PortalTicketDetail> {
    this.assertClient(actor);
    return toPortalTicketDetail(await this.transitions.reopen(actor, id, reason));
  }

  private assertClient(actor: AuthenticatedUser): void {
    if (!isClientUser(actor)) {
      throw new ForbiddenException('The portal is for client organizations');
    }
  }
}
