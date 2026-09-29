/**
 * Organisation administration: companies, people, roles, audit and system health.
 *
 * `organizationId` on a person or a role is the company it belongs to when that is not the signed-in
 * person's own: the API reads memberships and custom roles per organization, so the id has to travel
 * with the screen that opens them. The two list routes the menu opens carry nothing; the company
 * screen opens the same lists scoped to one client through the `AdminCompany…` routes.
 */
export type AdminParamList = {
  AdminCompanies: undefined;
  AdminCompanyDetail: { id: string };
  AdminCompanyUsers: { organizationId: string };
  AdminCompanyRoles: { organizationId: string };
  AdminUsers: undefined;
  AdminUserDetail: { id: string; organizationId?: string };
  AdminUserInvite: { organizationId?: string } | undefined;
  AdminRoles: undefined;
  AdminRoleDetail: { id: string; organizationId?: string };
  AuditLog: undefined;
  SystemStatus: undefined;
};
