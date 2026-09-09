import type {
  CredentialAccessLogRow,
  CredentialGrantSummary,
  CredentialRotationPolicy,
  PaginatedResponse,
  RevealedCredential,
  TestAccountSummary,
  TestEnvironment,
  TestEnvironmentRow,
  TestEnvironmentStatus,
  TesterQueue,
  TesterView,
  TestingAssignmentDetail,
  TestingAssignmentKind,
} from '@ashniva/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export const qaKeys = {
  all: ['qa'] as const,
  queue: (view: TesterView) => ['qa', 'queue', view] as const,
  assignment: (id: string) => ['qa', 'assignment', id] as const,
  testAccounts: (projectId: string) => ['qa', 'test-accounts', projectId] as const,
  environments: (projectId: string) => ['qa', 'environments', projectId] as const,
  accessLog: (projectId?: string) => ['qa', 'credential-access-log', projectId ?? 'all'] as const,
};

export function useTesterQueue(view: TesterView) {
  return useQuery({
    queryKey: qaKeys.queue(view),
    queryFn: () => apiRequest<TesterQueue>('/qa/assignments', { query: { view } }),
  });
}

export function useTestingAssignment(id: string | undefined) {
  return useQuery({
    queryKey: qaKeys.assignment(id ?? ''),
    queryFn: () => apiRequest<TestingAssignmentDetail>(`/qa/assignments/${id}`),
    enabled: Boolean(id),
  });
}

export function useTestAccounts(projectId: string | undefined) {
  return useQuery({
    queryKey: qaKeys.testAccounts(projectId ?? ''),
    queryFn: () => apiRequest<TestAccountSummary[]>(`/projects/${projectId}/test-accounts`),
    enabled: Boolean(projectId),
  });
}

export function useTestEnvironments(projectId: string | undefined) {
  return useQuery({
    queryKey: qaKeys.environments(projectId ?? ''),
    queryFn: () => apiRequest<TestEnvironmentRow[]>(`/projects/${projectId}/environments`),
    enabled: Boolean(projectId),
  });
}

/** `enabled` lets a screen skip the request for people without test-account:manage (no 403 noise). */
export function useCredentialAccessLog(projectId?: string, enabled = true) {
  return useQuery({
    queryKey: qaKeys.accessLog(projectId),
    queryFn: () =>
      apiRequest<PaginatedResponse<CredentialAccessLogRow>>('/credential-access-log', {
        query: { projectId },
      }),
    enabled,
  });
}

/**
 * Handing testing over — the payload `POST /qa/assignments` takes.
 *
 * Exactly one of `taskId`, `ticketId` and `releaseId`: the API refuses anything else, because two
 * subjects would make the queue's subject label a guess.
 */
export interface CreateAssignmentInput {
  projectId: string;
  kind: TestingAssignmentKind;
  taskId?: string;
  ticketId?: string;
  releaseId?: string;
  environment?: TestEnvironment;
  assignedToUserId?: string;
  stagingUrl?: string;
  whatDeveloped?: string;
  whatToTest?: string;
  acceptanceCriteria?: string;
  developerNotes?: string;
  dueAt?: string;
}

export interface TestResultInput {
  result: 'PASS' | 'FAIL';
  environment: string;
  whatTested: string;
  actualResult: string;
  failureDescription?: string;
  severity?: string;
  browserDevice?: string;
  commentForDeveloper?: string;
  retestRequired?: boolean;
  evidenceFileId?: string;
}

export interface TestEnvironmentInput {
  kind: TestEnvironment;
  url: string;
  status?: TestEnvironmentStatus;
  deployedVersion?: string;
  deployedAt?: string;
  githubEnvironmentName?: string;
}

export interface TestAccountInput {
  environment: TestEnvironment;
  environmentId?: string;
  label: string;
  username: string;
  /** Sent once, encrypted at rest by the API, and never read back. */
  secret: string;
  notes?: string;
  rotationPolicy?: CredentialRotationPolicy;
}

/** The secret is deliberately absent: changing a password is a rotation, not an edit. */
export interface TestAccountUpdateInput {
  environmentId?: string;
  label?: string;
  username?: string;
  notes?: string;
  rotationPolicy?: CredentialRotationPolicy;
  isActive?: boolean;
}

/**
 * The revealed password, fetched without React Query on purpose.
 *
 * A cache is readable from anywhere in the app for as long as it lives, and the whole point of a
 * timed reveal is that the value stops being available. That rules out `useQuery`, and it rules
 * out `useMutation` too: a mutation keeps its last result in the mutation cache until it is
 * garbage-collected, which outlives the sixty-second countdown. So this is a plain request whose
 * answer only ever reaches the component state that is counting down (see `useTimedReveal`).
 */
export function revealCredential(grantId: string): Promise<RevealedCredential> {
  return apiRequest<RevealedCredential>(`/grants/${grantId}/reveal`, { method: 'POST' });
}

export function useQaMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: qaKeys.all });

  return {
    /**
     * Hands testing over.
     *
     * The endpoint has existed since the QA module shipped with nothing calling it, which is why
     * a project that gates on QA — the default — could never satisfy the gate and so could never
     * publish a release. Invalidating the whole QA cache is deliberate: a new assignment changes
     * the tester's queue counts as well as the row.
     */
    createAssignment: useMutation({
      mutationFn: (input: CreateAssignmentInput) =>
        apiRequest<TestingAssignmentDetail>('/qa/assignments', { method: 'POST', body: input }),
      onSuccess: refresh,
    }),
    cancelAssignment: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
        apiRequest<TestingAssignmentDetail>(`/qa/assignments/${id}/cancel`, {
          method: 'POST',
          body: { reason },
        }),
      onSuccess: refresh,
    }),
    start: useMutation({
      mutationFn: (id: string) =>
        apiRequest<TestingAssignmentDetail>(`/qa/assignments/${id}/start`, { method: 'POST' }),
      onSuccess: refresh,
    }),
    recordResult: useMutation({
      mutationFn: ({ id, input }: { id: string; input: TestResultInput }) =>
        apiRequest<TestingAssignmentDetail>(`/qa/assignments/${id}/result`, {
          method: 'POST',
          body: input,
        }),
      onSuccess: refresh,
    }),
    clarify: useMutation({
      mutationFn: ({ id, question }: { id: string; question: string }) =>
        apiRequest<TestingAssignmentDetail>(`/qa/assignments/${id}/clarify`, {
          method: 'POST',
          body: { question },
        }),
      onSuccess: refresh,
    }),
    verifyLive: useMutation({
      mutationFn: (id: string) =>
        apiRequest<TestingAssignmentDetail>(`/qa/assignments/${id}/verify-live`, {
          method: 'POST',
        }),
      onSuccess: refresh,
    }),
    grant: useMutation({
      mutationFn: ({
        testAccountId,
        grantedToUserId,
        reason,
        assignmentId,
      }: {
        testAccountId: string;
        grantedToUserId: string;
        reason: string;
        assignmentId?: string;
      }) =>
        apiRequest<CredentialGrantSummary>(`/test-accounts/${testAccountId}/grant`, {
          method: 'POST',
          body: { grantedToUserId, reason, assignmentId },
        }),
      onSuccess: refresh,
    }),
  };
}

export function useTestEnvironmentMutations(projectId: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: qaKeys.environments(projectId) });

  return {
    create: useMutation({
      mutationFn: (input: TestEnvironmentInput) =>
        apiRequest<TestEnvironmentRow>(`/projects/${projectId}/environments`, {
          method: 'POST',
          body: input,
        }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: Omit<TestEnvironmentInput, 'kind'> }) =>
        apiRequest<TestEnvironmentRow>(`/environments/${id}`, { method: 'PATCH', body: input }),
      onSuccess: refresh,
    }),
  };
}

/**
 * Creating and rotating both carry a password up to the API. Neither answer carries one back —
 * `TestAccountSummary` has no secret field — so nothing here can put one in the query cache.
 */
export function useTestAccountMutations(projectId: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: qaKeys.all });

  return {
    create: useMutation({
      mutationFn: (input: TestAccountInput) =>
        apiRequest<TestAccountSummary>(`/projects/${projectId}/test-accounts`, {
          method: 'POST',
          body: input,
        }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: TestAccountUpdateInput }) =>
        apiRequest<TestAccountSummary>(`/test-accounts/${id}`, { method: 'PATCH', body: input }),
      onSuccess: refresh,
    }),
    rotate: useMutation({
      mutationFn: ({ id, secret }: { id: string; secret?: string }) =>
        apiRequest<TestAccountSummary>(`/test-accounts/${id}/rotate`, {
          method: 'POST',
          body: secret ? { secret } : {},
        }),
      onSuccess: refresh,
    }),
  };
}
