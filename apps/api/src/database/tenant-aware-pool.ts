import { Pool, type PoolClient, type PoolConfig } from 'pg';

/** PostgreSQL role the API switches to on every connection so row-level security applies. */
export const APP_DB_ROLE = 'ashniva_app';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TenantResolver {
  (): { organizationId?: string; userId?: string } | undefined;
}

export interface TenantAwarePoolOptions extends PoolConfig {
  /** Reads the tenant of the code path that is acquiring the connection (AsyncLocalStorage). */
  resolveTenant: TenantResolver;
  /** Skip SET ROLE (the seed and one-off scripts run as the migration owner). */
  useAppRole?: boolean;
}

type ConnectCallback = (
  err: Error | undefined,
  client: PoolClient | undefined,
  done: (release?: unknown) => void,
) => void;

/**
 * A pg Pool that stamps the current tenant on every connection it hands out.
 *
 * Why here and not in Prisma: with connection pooling a pooled connection serves many requests,
 * so the tenant must be (re)set each time a connection is acquired. pg's `pool.query()` and the
 * Prisma adapter's transactions both go through `connect()`, which makes this the one choke
 * point. The statement also switches to the non-superuser application role, because PostgreSQL
 * superusers and table owners bypass row-level security otherwise.
 *
 * The setting is session-level (is_local = false) so it survives until the next acquisition,
 * when it is overwritten again — a connection never carries a stale tenant into another request.
 */
export class TenantAwarePool extends Pool {
  private readonly resolveTenant: TenantResolver;
  private readonly useAppRole: boolean;

  constructor(options: TenantAwarePoolOptions) {
    const { resolveTenant, useAppRole, ...poolConfig } = options;
    super(poolConfig);
    this.resolveTenant = resolveTenant;
    this.useAppRole = useAppRole ?? true;
  }

  override connect(): Promise<PoolClient>;
  override connect(callback: ConnectCallback): void;
  override connect(callback?: ConnectCallback): Promise<PoolClient> | void {
    // Capture the tenant now, in the caller's async context. When the pool is busy the client is
    // handed out later from whichever request released it, and that request's context would be
    // the wrong one to read.
    const stamp = this.stampStatement();
    if (callback) {
      super.connect((error, client, done) => {
        if (error || !client) {
          callback(error, client, done);
          return;
        }
        client.query(stamp).then(
          () => callback(undefined, client, done),
          (stampError: Error) => {
            done(stampError);
            callback(stampError, undefined, done);
          },
        );
      });
      return;
    }
    return super.connect().then(async (client) => {
      try {
        await client.query(stamp);
        return client;
      } catch (error) {
        client.release(error as Error);
        throw error;
      }
    });
  }

  /** One round trip: switch role and publish the tenant + user to the row-level policies. */
  stampStatement(): string {
    const context = this.resolveTenant();
    const tenant = safeUuid(context?.organizationId);
    const user = safeUuid(context?.userId);
    const settings = `SELECT set_config('app.tenant_id', '${tenant}', false), set_config('app.user_id', '${user}', false)`;
    return this.useAppRole ? `SET ROLE ${APP_DB_ROLE}; ${settings}` : settings;
  }
}

/** Only well-formed UUIDs are interpolated; anything else becomes "no tenant". */
function safeUuid(value: string | undefined): string {
  return value && UUID_PATTERN.test(value) ? value.toLowerCase() : '';
}
