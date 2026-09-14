import type {
  DirectoryEntry,
  OrganizationOption,
  OrganizationSummary,
  OrganizationType,
  RoleKey,
  RoleSummary,
  UserCreatedResponse,
  TeamSummary,
  UserStatus,
  UserSummary,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export const identityKeys = {
  directory: ['users', 'directory'] as const,
  users: (organizationId?: string) => ['users', 'list', organizationId ?? 'own'] as const,
  organizations: ['organizations'] as const,
  organizationDirectory: ['organizations', 'directory'] as const,
  teams: ['teams'] as const,
  roles: ['roles'] as const,
};

/** Everyone in the organization, for assignee / reviewer / tester pickers. */
export function useDirectoryQuery(enabled = true) {
  return useQuery({
    queryKey: identityKeys.directory,
    queryFn: () => apiRequest<DirectoryEntry[]>('/users/directory'),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

export function useUsersQuery(organizationId?: string) {
  return useQuery({
    queryKey: identityKeys.users(organizationId),
    queryFn: () => apiRequest<UserSummary[]>('/users', { query: { organizationId } }),
  });
}

/**
 * Names for a company picker. Every filter and form in the product wants this; only the
 * Companies & clients screen wants the counts, and it uses `useOrganizationDirectoryQuery`.
 */
export function useOrganizationsQuery(enabled = true) {
  return useQuery({
    queryKey: identityKeys.organizations,
    queryFn: () => apiRequest<OrganizationOption[]>('/organizations/options'),
    enabled,
  });
}

/** The administrative list with user, project and open-ticket counts (`organization:manage`). */
export function useOrganizationDirectoryQuery(enabled = true) {
  return useQuery({
    queryKey: identityKeys.organizationDirectory,
    queryFn: () => apiRequest<OrganizationSummary[]>('/organizations'),
    enabled,
  });
}

export function useTeamsQuery() {
  return useQuery({
    queryKey: identityKeys.teams,
    queryFn: () => apiRequest<TeamSummary[]>('/teams'),
  });
}

export function useRolesQuery() {
  return useQuery({
    queryKey: identityKeys.roles,
    queryFn: () => apiRequest<RoleSummary[]>('/roles'),
  });
}

export interface CreateUserInput {
  email: string;
  name: string;
  /** Omitted → the person is invited and an invitation link comes back. */
  password?: string;
  roleKey?: RoleKey;
  /** A custom role (system roles go by key). */
  roleId?: string;
  organizationId?: string;
  title?: string;
  phone?: string;
  showDevelopmentSection?: boolean;
  teamIds?: string[];
}

export interface UpdateUserInput {
  organizationId?: string;
  email?: string;
  password?: string;
  name?: string;
  title?: string | null;
  showDevelopmentSection?: boolean;
  teamIds?: string[];
}

export function useUserMutations() {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['users'] });
    await queryClient.invalidateQueries({ queryKey: identityKeys.teams });
    await queryClient.invalidateQueries({ queryKey: identityKeys.organizations });
  };
  return {
    /**
     * Creating a person needs a fresh password check, like a role change: this call chooses a
     * role and answers with an invitation link, which is a credential for the account it made.
     * Pass the headers from `useReauth`.
     */
    create: useMutation({
      mutationFn: ({ headers, ...body }: CreateUserInput & { headers: Record<string, string> }) =>
        apiRequest<UserCreatedResponse>('/users', { method: 'POST', body, headers }),
      onSuccess: invalidate,
    }),
    /** Same: a fresh invitation link is a fresh credential. */
    invite: useMutation({
      mutationFn: ({
        id,
        organizationId,
        headers,
      }: {
        id: string;
        organizationId?: string;
        headers: Record<string, string>;
      }) =>
        apiRequest<{ link: string; expiresAt: string }>(`/users/${id}/invitations`, {
          method: 'POST',
          query: { organizationId },
          headers,
        }),
    }),
    /** Role changes need a fresh password check: pass the re-auth headers from `useReauth`. */
    changeRole: useMutation({
      mutationFn: ({
        id,
        headers,
        ...body
      }: {
        id: string;
        organizationId?: string;
        roleKey?: RoleKey;
        roleId?: string;
        headers: Record<string, string>;
      }) => apiRequest<UserSummary>(`/users/${id}/role`, { method: 'POST', body, headers }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: UpdateUserInput & { id: string }) =>
        apiRequest<UserSummary>(`/users/${id}`, { method: 'PATCH', body }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: ({ id, organizationId }: { id: string; organizationId?: string }) =>
        apiRequest<void>(`/users/${id}`, { method: 'DELETE', query: { organizationId } }),
      onSuccess: invalidate,
    }),
    setStatus: useMutation({
      mutationFn: ({
        id,
        status,
        organizationId,
      }: {
        id: string;
        status: UserStatus;
        organizationId?: string;
      }) =>
        apiRequest<UserSummary>(`/users/${id}/${status === 'ACTIVE' ? 'activate' : 'deactivate'}`, {
          method: 'POST',
          query: { organizationId },
        }),
      onSuccess: invalidate,
    }),
  };
}

export interface OrganizationInput {
  name: string;
  slug?: string;
  type: OrganizationType;
  timezone?: string;
  currency?: string;
}

export function useOrganizationMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['organizations'] });
  return {
    create: useMutation({
      mutationFn: (body: OrganizationInput) =>
        apiRequest<OrganizationSummary>('/organizations', { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: Partial<OrganizationInput> & { id: string }) =>
        apiRequest<OrganizationSummary>(`/organizations/${id}`, { method: 'PATCH', body }),
      onSuccess: invalidate,
    }),
  };
}

export function useTeamMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: identityKeys.teams });
  return {
    create: useMutation({
      mutationFn: (body: {
        name: string;
        description?: string;
        leadUserId?: string;
        memberIds?: string[];
      }) => apiRequest<TeamSummary>('/teams', { method: 'POST', body }),
      onSuccess: invalidate,
    }),
    setMembers: useMutation({
      mutationFn: ({ id, userIds }: { id: string; userIds: string[] }) =>
        apiRequest<TeamSummary>(`/teams/${id}/members`, { method: 'PUT', body: { userIds } }),
      onSuccess: invalidate,
    }),
  };
}
