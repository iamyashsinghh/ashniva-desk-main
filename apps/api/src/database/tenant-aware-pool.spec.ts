import { APP_DB_ROLE, TenantAwarePool } from './tenant-aware-pool';

describe('TenantAwarePool', () => {
  const build = (
    context: { organizationId?: string; userId?: string } | undefined,
    useAppRole?: boolean,
  ) =>
    new TenantAwarePool({
      connectionString: 'postgresql://user:pass@localhost:5432/db',
      resolveTenant: () => context,
      useAppRole,
    });

  it('switches to the application role and publishes tenant and user', () => {
    const pool = build({
      organizationId: '01A07344-5F6D-7497-AC5C-142E27BBCDF6',
      userId: '01a07344-5f6d-7497-ac5c-142e27bbcdf7',
    });
    expect(pool.stampStatement()).toBe(
      `SET ROLE ${APP_DB_ROLE}; SELECT set_config('app.tenant_id', '01a07344-5f6d-7497-ac5c-142e27bbcdf6', false), set_config('app.user_id', '01a07344-5f6d-7497-ac5c-142e27bbcdf7', false)`,
    );
  });

  it('clears the tenant when the code path has no context', () => {
    expect(build(undefined).stampStatement()).toContain("set_config('app.tenant_id', '', false)");
  });

  it('never interpolates anything that is not a UUID', () => {
    const pool = build({ organizationId: "x'; DROP TABLE tasks; --", userId: 'not-a-uuid' });
    expect(pool.stampStatement()).toContain("set_config('app.tenant_id', '', false)");
    expect(pool.stampStatement()).toContain("set_config('app.user_id', '', false)");
    expect(pool.stampStatement()).not.toContain('DROP');
  });

  it('can skip the role switch for owner-level scripts', () => {
    expect(build(undefined, false).stampStatement()).not.toContain('SET ROLE');
  });
});
