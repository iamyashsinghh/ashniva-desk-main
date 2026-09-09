import { TenantContextService } from './tenant-context.service';

describe('TenantContextService', () => {
  it('keeps values inside the run scope', () => {
    const service = new TenantContextService();

    service.run({ requestId: 'r1' }, () => {
      service.set({ organizationId: 'org-1', userId: 'user-1' });
      expect(service.get()).toEqual({ requestId: 'r1', organizationId: 'org-1', userId: 'user-1' });
      expect(service.requireOrganizationId()).toBe('org-1');
    });

    expect(service.get()).toBeUndefined();
    expect(() => service.requireOrganizationId()).toThrow(/organizationId/);
  });

  it('isolates concurrent scopes', async () => {
    const service = new TenantContextService();
    const results = await Promise.all(
      ['a', 'b'].map((organizationId) =>
        service.run({ organizationId }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return service.requireOrganizationId();
        }),
      ),
    );
    expect(results).toEqual(['a', 'b']);
  });
});
