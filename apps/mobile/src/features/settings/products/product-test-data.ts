import type {
  IvrPolicySummary,
  IvrReadiness,
  ProductDetail,
  ProductSummary,
  SupportTierPolicySummary,
} from '@ashniva/types';

/** Fixtures for the product screen tests. Imported only by tests. */

export const SUMMARY: ProductSummary = {
  id: 'prod-1',
  code: 'CARELIX',
  name: 'Carelix',
  description: null,
  isActive: true,
  supportEnabled: true,
  autoRouteEnabled: true,
  ivrEnabled: false,
  supportTier: 'STANDARD',
  project: { id: 'p1', code: 'ASH', name: 'Ashniva portal' },
  activeCredentials: 1,
  openTickets: 3,
  updatedAt: '2026-09-01T10:00:00.000Z',
};

export const UNLINKED: ProductSummary = {
  ...SUMMARY,
  id: 'prod-2',
  code: 'IRISTA',
  name: 'Irista',
  supportEnabled: false,
  project: null,
  activeCredentials: 0,
  openTickets: 0,
};

export const DETAIL: ProductDetail = {
  ...SUMMARY,
  allowedSources: [],
  allowedWorkAreas: ['Billing'],
  allowedOrigins: [],
  defaultPriority: 'MEDIUM',
  defaultType: 'SUPPORT',
  supportRequester: null,
  credentials: [
    {
      id: 'cred-1',
      keyId: 'key_1234567890abcdef',
      label: 'Carelix production',
      isActive: true,
      lastUsedAt: null,
      rotatedAt: null,
      revokedAt: null,
      createdBy: null,
      createdAt: '2026-09-01T10:00:00.000Z',
    },
  ],
  createdAt: '2026-09-01T10:00:00.000Z',
};

export const IVR_POLICY: IvrPolicySummary = {
  productId: 'prod-1',
  ivrEnabled: false,
  recordingPolicy: 'DISABLED',
  recordingPlaybackScope: 'LEADS_ONLY',
  allowedTiers: [],
  requesterInitiateEnabled: false,
  fallbackUser: null,
  maxAttempts: 3,
  updatedAt: null,
};

export const READINESS: IvrReadiness = {
  provider: 'Tata',
  healthy: false,
  ready: ['Webhook endpoint registered'],
  missing: [{ key: 'api', what: 'The provider API contract', needs: ['Base URL'] }],
  behaviourWhenUnready: 'Calls end in the support queue with a person notified.',
};

export const TIERS: SupportTierPolicySummary[] = [
  {
    tier: 'STANDARD',
    admissionEnabled: true,
    slaPolicy: null,
    minimumPriority: null,
    callsEnabled: true,
    requesterInitiatedCalls: true,
    dedicatedOwnership: false,
    ackMinutes: null,
    escalationMinutes: null,
    fallbackStrategy: 'SUPPORT_QUEUE',
    availabilityWindow: 'BUSINESS_HOURS',
    configured: false,
    updatedAt: null,
  },
];
