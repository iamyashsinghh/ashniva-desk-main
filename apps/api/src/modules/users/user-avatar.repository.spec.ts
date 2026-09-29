import type { TenantContextService } from '../../common/tenant/tenant-context.service';
import type { PrismaService } from '../../database/prisma.service';
import { UserAvatarRepository } from './user-avatar.repository';

describe('UserAvatarRepository.findInTenant', () => {
  it('only finds a person with a live membership in the caller’s current organization', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = { user: { findFirst } } as unknown as PrismaService;
    const tenant = {
      requireOrganizationId: () => 'org-mine',
    } as unknown as TenantContextService;

    await new UserAvatarRepository(prisma, tenant).findInTenant('user-elsewhere');

    expect(findFirst.mock.calls[0]?.[0].where).toEqual({
      id: 'user-elsewhere',
      deletedAt: null,
      memberships: { some: { organizationId: 'org-mine', deletedAt: null } },
    });
  });
});
