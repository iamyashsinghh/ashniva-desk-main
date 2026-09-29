/** A client's portal screens beyond the tabs: projects, contracts, change requests, reports. */
export type PortalParamList = {
  PortalProjects: undefined;
  PortalProjectDetail: { id: string };
  PortalContracts: undefined;
  PortalContractDetail: { id: string };
  PortalChangeRequests: undefined;
  PortalChangeRequestDetail: { id: string };
  PortalReports: undefined;
  PortalProgressSummaries: undefined;
  PortalProgressSummary: { id: string };
};
