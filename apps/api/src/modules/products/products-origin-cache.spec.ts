import { ROLE_KEYS, type AuthenticatedUser } from '@ashniva/types';

import type { PrismaService } from '../../database/prisma.service';
import type { AuditLogService } from '../audit-logs/audit-log.service';
import type { TicketSlaService } from '../sla-escalations/ticket-sla.service';
import { ProductsService } from './products.service';
import type { ProductRow, ProductsRepository } from './products.repository';
import type { WidgetOriginRegistry } from './widget-origin.registry';

/**
 * When the registry's origin cache is dropped.
 *
 * The cache answers CORS preflights for up to `ORIGIN_CACHE_TTL_MS`, and it is loaded from exactly
 * three columns: `allowedOrigins`, `isActive` and `supportEnabled`. Every write that can change one
 * of them therefore has to drop it, and the failure is silent in both directions — a newly created
 * product's widget is blocked with no error to read, and a product whose support was just switched
 * off keeps answering preflights as if it were live.
 *
 * Asserted here rather than end to end because the window is a wall-clock one: a test that waited
 * for a stale cache would be a test that sometimes waited for nothing.
 */

const actor: AuthenticatedUser = {
  userId: 'user-pm',
  organizationId: 'org-provider',
  roleKey: ROLE_KEYS.PROJECT_MANAGER,
  isServiceProvider: true,
  permissions: [],
};

function productRow(over: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'product-1',
    code: 'CRX',
    name: 'Carelix',
    description: null,
    isActive: true,
    supportEnabled: true,
    autoRouteEnabled: false,
    ivrEnabled: false,
    supportTier: 'STANDARD',
    projectId: 'project-1',
    supportRequesterId: null,
    allowedSources: [],
    allowedWorkAreas: [],
    allowedOrigins: ['https://app.carelix.example'],
    defaultPriority: 'MEDIUM',
    defaultType: 'BUG',
    project: null,
    supportRequester: null,
    credentials: [],
    createdAt: new Date('2026-09-17T09:00:00.000Z'),
    updatedAt: new Date('2026-09-17T09:00:00.000Z'),
    ...over,
    // ProductRow carries columns no mapper reads; the cast keeps the fixture to what is asserted.
  } as unknown as ProductRow;
}

function serviceWith(row: ProductRow) {
  const invalidate = jest.fn();
  const products = {
    create: jest.fn().mockResolvedValue(row),
    update: jest.fn().mockResolvedValue(row),
    find: jest.fn().mockResolvedValue(row),
  } as unknown as ProductsRepository;
  const prisma = {
    product: { count: jest.fn().mockResolvedValue(0) },
    project: { count: jest.fn().mockResolvedValue(1) },
    organizationMembership: { count: jest.fn().mockResolvedValue(1) },
  } as unknown as PrismaService;
  const auditLog = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const ticketSla = {
    reapply: jest.fn().mockResolvedValue(undefined),
  } as unknown as TicketSlaService;
  const origins = { invalidate } as unknown as WidgetOriginRegistry;

  return {
    service: new ProductsService(products, prisma, auditLog, ticketSla, origins),
    invalidate,
  };
}

describe('ProductsService and the widget origin cache', () => {
  it('drops the cache when a product is created with origins', async () => {
    const { service, invalidate } = serviceWith(productRow());
    await service.create(actor, {
      code: 'CRX',
      name: 'Carelix',
      allowedOrigins: ['https://app.carelix.example'],
    });
    expect(invalidate).toHaveBeenCalled();
  });

  it('drops the cache when a product’s origins change', async () => {
    const { service, invalidate } = serviceWith(productRow());
    await service.update(actor, 'product-1', { allowedOrigins: ['https://new.carelix.example'] });
    expect(invalidate).toHaveBeenCalled();
  });

  /**
   * Deactivating and switching support off are how an operator stops a widget. Both drop the
   * product out of the registry's query, so both have to drop the cache — otherwise the widget
   * keeps being told it may call for another half a minute after somebody turned it off.
   */
  it.each([{ isActive: false }, { supportEnabled: false }])(
    'drops the cache when a product is switched off with %o',
    async (change) => {
      const { service, invalidate } = serviceWith(productRow(change));
      await service.update(actor, 'product-1', change);
      expect(invalidate).toHaveBeenCalled();
    },
  );

  it('leaves the cache alone for a change the registry cannot see', async () => {
    const { service, invalidate } = serviceWith(productRow());
    await service.update(actor, 'product-1', { name: 'Carelix Cloud' });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
