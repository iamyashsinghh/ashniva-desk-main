/** Contracts, change requests and milestones, on the provider's side. */
export type CommercialParamList = {
  Contracts: undefined;
  ContractDetail: { id: string };
  /** No id: a new contract. */
  ContractForm: { id?: string } | undefined;
  ChangeRequests: undefined;
  ChangeRequestDetail: { id: string };
  /** No id: raise a new one. */
  ChangeRequestForm: { id?: string } | undefined;
  MilestoneDetail: { id: string };
  /** `id` edits; otherwise a new milestone in `projectId`, optionally under `contractId`. */
  MilestoneForm: { id?: string; projectId?: string; contractId?: string };
};
