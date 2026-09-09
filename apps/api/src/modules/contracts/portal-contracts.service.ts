import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  VISIBILITY,
  type AuthenticatedUser,
  type ContractHourBalance,
  type PortalContractDetail,
  type PortalContractSummary,
} from '@ashniva/types';

import { isClientUser } from '../../common/auth/access-scope';
import { boundedList } from '../../common/dto/unpaginated-list';
import { toFileSummary } from '../files/files.service';
import { MilestonesService } from '../milestones/milestones.service';
import { showsBalance } from './contract-periods';
import { toPortalContractDetail, toPortalContractSummary } from './contracts.mapper';
import { ContractsRepository, type ContractSummaryRow } from './contracts.repository';
import { HourBalanceReader } from './hour-balance-reader.service';

/** Client-portal view of contracts: the client's own, non-draft contracts through allow-list mappers. */
@Injectable()
export class PortalContractsService {
  constructor(
    private readonly contracts: ContractsRepository,
    private readonly balances: HourBalanceReader,
    private readonly milestones: MilestonesService,
  ) {}

  async list(actor: AuthenticatedUser): Promise<PortalContractSummary[]> {
    this.assertClient(actor);
    const rows = await this.contracts.listForClient(actor.organizationId);
    // One pair of queries for the whole list. This route takes no `limit`, so a client with a
    // long history used to open one interactive transaction per contract.
    const balances = await this.balances.balances(rows.filter(showsBalance));
    return boundedList(
      'GET /portal/contracts',
      rows.map((row) => toPortalContractSummary(row, balances.get(row.id) ?? null)),
    );
  }

  async get(actor: AuthenticatedUser, id: string): Promise<PortalContractDetail> {
    this.assertClient(actor);
    const row = await this.contracts.findForClient(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('Contract not found');
    }
    const [balance, milestones, ledger] = await Promise.all([
      this.balanceOf(row),
      this.milestones.summariesForContract(row.organizationId, row.id),
      this.contracts.listLedger(row.id, { limit: 20 }),
    ]);
    const documents = row.documents
      .filter((file) => file.visibility === VISIBILITY.CLIENT)
      .map((file) => toFileSummary(file as Parameters<typeof toFileSummary>[0]));
    return toPortalContractDetail(
      row,
      balance,
      milestones.filter((milestone) => milestone.clientVisible),
      ledger.slice(0, 20),
      documents,
    );
  }

  private balanceOf(row: ContractSummaryRow): Promise<ContractHourBalance | null> {
    return showsBalance(row) ? this.balances.balance(row) : Promise.resolve(null);
  }

  private assertClient(actor: AuthenticatedUser): void {
    if (!isClientUser(actor)) {
      throw new ForbiddenException('The portal is for client organizations');
    }
  }
}
