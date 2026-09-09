import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const commaSeparatedList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

/**
 * A three-state switch: on, off, or "not set, so the code decides from the environment".
 *
 * `booleanFromString` cannot express this, because its default collapses "unset" and "false" into
 * the same value. Two settings genuinely need the difference — the API documentation is on in
 * development and off in production unless somebody says otherwise, and there is no single default
 * that says that.
 */
const optionalBooleanFromString = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

/**
 * How many reverse proxies sit in front of the API, or `false` for none.
 *
 * Express's `trust proxy` decides which entry of `X-Forwarded-For` becomes `req.ip` and whether
 * `req.secure` believes `X-Forwarded-Proto`. Both matter here: the throttler counts per IP, and
 * the refresh cookie's `Secure` flag follows the request's scheme.
 *
 * A hop count rather than `true`: `true` trusts the whole `X-Forwarded-For` chain, so a client can
 * prepend addresses of its own and choose its own throttle bucket. A count of `n` trusts the `n`
 * proxies nearest the API and takes the address in front of them, which a client cannot forge.
 *
 * Deliberately no default. "Nobody said" and "somebody said there is no proxy" have to be
 * different answers, because production refuses the first and accepts the second — see the
 * production block below. Outside production `AppConfigService` reads the absent value as `false`,
 * so a developer still starts the app in one command.
 */
const trustProxyHops = z
  .string()
  .superRefine((value, ctx) => {
    if (value === 'false') {
      return;
    }
    if (value === 'true') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'TRUST_PROXY=true trusts the whole X-Forwarded-For chain, which lets a client pick its ' +
          'own rate-limit bucket. Set the number of proxies in front of the API instead (1 for a ' +
          'single load balancer), or false when there is none.',
      });
      return;
    }
    if (!/^[1-9]\d*$/.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'TRUST_PROXY must be false or the number of proxies in front of the API',
      });
    }
  })
  .transform((value): number | false => (value === 'false' ? false : Number(value)))
  .optional();

/**
 * Values `.env.example` ships so a developer can run the app without inventing secrets.
 *
 * They are in the repository, so they are public. Any one of them reaching production would be a
 * signing key an attacker already has, which is why production refuses them by name below rather
 * than trusting their length.
 */
const EXAMPLE_JWT_SECRETS = [
  'local-dev-access-secret-please-change-0123456789',
  'local-dev-refresh-secret-please-change-0123456789',
];

/**
 * Words that only appear in a secret nobody has replaced yet.
 *
 * A deliberate blunt instrument. It cannot recognise every weak secret — that is what length and a
 * real generator are for — but it does catch the failure that actually happens: a placeholder
 * copied from a README or an example file and never changed.
 */
const PLACEHOLDER_MARKERS = [
  'changeme',
  'change-me',
  'please-change',
  'placeholder',
  'example',
  'local-dev',
  'localdev',
  'secret-here',
  'your-secret',
  'replace-me',
  'todo',
  'xxxxxxxx',
];

/** Why a secret is unusable in production, or `undefined` when it looks like a real one. */
export function placeholderSecretReason(value: string): string | undefined {
  if (EXAMPLE_JWT_SECRETS.includes(value)) {
    return 'this is the value apps/api/.env.example ships, so it is public';
  }
  const lower = value.toLowerCase();
  const marker = PLACEHOLDER_MARKERS.find((candidate) => lower.includes(candidate));
  if (marker) {
    return `it contains "${marker}", which reads as a placeholder`;
  }
  if (new Set(lower.replace(/[^a-z0-9]/g, '')).size < 8) {
    return 'it repeats too few distinct characters to be a generated secret';
  }
  return undefined;
}

/**
 * Every environment variable the API reads, with validation.
 * The app refuses to start when a required value is missing or malformed.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    /**
     * How many proxies sit between the internet and the API. See `trustProxyHops`.
     *
     * Unset reads as "trust nothing", which is right for a container reached directly and wrong
     * the moment a load balancer appears: every request would then share the balancer's IP, so the
     * global rate limit throttles the whole deployment at once and the login throttle stops
     * distinguishing anybody, while `X-Forwarded-Proto: https` goes unread and the refresh cookie
     * loses `Secure`. Production therefore refuses to guess — it requires the answer in writing.
     */
    TRUST_PROXY: trustProxyHops,

    DATABASE_URL: z.string().url().startsWith('postgres'),
    REDIS_URL: z.string().url().startsWith('redis'),

    /**
     * Connection-pool and statement limits for the pg pool behind Prisma.
     *
     * The pool is per API instance, so the ceiling PostgreSQL sees is `DB_POOL_MAX × instances`
     * and must stay under the server's `max_connections` with room for migrations and psql.
     *
     * Every checkout costs one extra round trip: `TenantAwarePool` stamps the tenant on the
     * connection it hands out (see the class comment), so a pool small enough to force frequent
     * checkouts pays that round trip more often. Sizing up trades PostgreSQL memory for fewer
     * stamps; the acquire timeout is what turns "pool exhausted" from a hang into an error.
     *
     * The default is eleven because there are eleven queues, each a worker holding one connection
     * while a job runs, and the workers share this pool with the HTTP server. It went from ten to
     * eleven when the support-callbacks queue arrived: a new queue is a change to this budget
     * whether or not anybody touched a concurrency, and `worker-concurrency.spec.ts` fails until
     * the two agree.
     *
     * Worth being plain that this is a floor and not a comfortable number. Pool *equal to* worker
     * count means that with every queue busy the HTTP server waits, and requests then fail at
     * `DB_POOL_ACQUIRE_TIMEOUT_MS` rather than merely slowing down. Sizing it properly wants the
     * load test the staging checklist asks for; raising it here without that evidence would be
     * guessing with PostgreSQL's memory.
     */
    DB_POOL_MAX: z.coerce.number().int().min(1).max(1000).default(11),
    DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000),
    DB_POOL_ACQUIRE_TIMEOUT_MS: z.coerce.number().int().min(100).default(10_000),
    /** PostgreSQL cancels a statement running longer than this. 0 disables the limit. */
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(0).default(30_000),

    STORAGE_ENDPOINT: z.string().url(),
    STORAGE_REGION: z.string().min(1).default('us-east-1'),
    STORAGE_BUCKET: z.string().min(3),
    STORAGE_ACCESS_KEY: z.string().min(1),
    STORAGE_SECRET_KEY: z.string().min(1),
    STORAGE_FORCE_PATH_STYLE: booleanFromString,
    STORAGE_AUTO_CREATE_BUCKET: booleanFromString,

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60 * 24 * 30),

    /**
     * Base64-encoded 32-byte key for secrets at rest (AES-256-GCM).
     *
     * Optional outside production so a developer can run the parts of the app that store nothing
     * encrypted. In production it is REQUIRED and checked below: there is deliberately no default
     * and no fallback, because a fixed key committed to a repository is equivalent to no
     * encryption at all. Generate one with: openssl rand -base64 32
     */
    APP_ENCRYPTION_KEY: z
      .string()
      .optional()
      .transform((value) => (value && value.length > 0 ? value : undefined)),

    CORS_ORIGINS: commaSeparatedList,

    /**
     * Whether `/api/docs` is served.
     *
     * Unset means "on outside production": a developer gets the documentation, a production
     * deployment does not publish every route and every DTO shape to anyone who asks. Setting it
     * explicitly overrides that in both directions — a staging box that runs with
     * `NODE_ENV=production` can still turn the documentation on, deliberately and in writing.
     */
    API_DOCS_ENABLED: optionalBooleanFromString,

    /**
     * Shared secret a metrics scraper presents as `Authorization: Bearer …`.
     *
     * A token rather than a permission because the caller is Prometheus, which holds no session.
     * Unset, the route answers 404 to everyone — `MetricsModule` is registered either way and the
     * guard is what refuses, so there is nothing to see whether the token is absent, or present
     * and wrong. The numbers describe the deployment's internals, so "no token configured" means
     * "nobody may read them", not "everybody may".
     */
    METRICS_TOKEN: z
      .string()
      .min(16, 'METRICS_TOKEN must be at least 16 characters')
      .optional()
      .or(z.literal('').transform(() => undefined)),

    /**
     * How long a SIGTERM waits for queue workers to finish the jobs they already picked up.
     *
     * Shorter than the orchestrator's own kill grace period, or the process is killed mid-drain
     * and the bounded shutdown buys nothing.
     */
    QUEUE_SHUTDOWN_GRACE_MS: z.coerce.number().int().min(0).max(120_000).default(15_000),

    /**
     * Lets `pnpm db:seed` plant demo users and demo data with `NODE_ENV=production`.
     *
     * For a preview deployment that is production-shaped but disposable. Never for a real one:
     * the demo users have a shared, documented password.
     */
    ALLOW_DEMO_SEED: booleanFromString,

    /**
     * Hosts an outbound integration may reach even though they resolve inside a private network.
     *
     * The escape hatch for a self-hosted GitLab or a staging environment that genuinely lives on
     * the operator's own network. Everything not listed here is judged on the address it resolves
     * to — see `SafeHttpService`. List hostnames, not ranges: the point is to name the few
     * machines that are meant to be reachable, not to reopen a range.
     */
    OUTBOUND_ALLOWED_HOSTS: commaSeparatedList,

    /**
     * SMTP servers the API may reach even though they resolve inside a private network.
     *
     * Separate from `OUTBOUND_ALLOWED_HOSTS` on purpose. An internal mail relay is a genuinely
     * common deployment — far more common than a private HTTP integration — but permitting one
     * should not also permit the git, AI and WhatsApp integrations to make requests to it. Each
     * list opens the machines it names to one protocol and nothing else.
     */
    SMTP_ALLOWED_HOSTS: commaSeparatedList,

    RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

    APP_TIMEZONE: z.string().min(1).default('Asia/Kolkata'),

    /**
     * Public URL of the web app, used to build invitation and password-reset links.
     *
     * Optional here and required in production below, rather than defaulted everywhere: a
     * deployment that kept the development default would mint invitations and password resets
     * pointing at the recipient's own machine, which fail silently and look like a mail problem
     * for a week. `AppConfigService` supplies the localhost value outside production.
     *
     * Required, not "must not be localhost" — the docker-compose preview genuinely runs with
     * NODE_ENV=production and genuinely serves the web app on localhost. What must not happen is
     * a real deployment keeping a value nobody chose.
     */
    APP_WEB_URL: z.string().url().optional(),
    /** Lifetime of invitation links, in hours. */
    INVITATION_TTL_HOURS: z.coerce
      .number()
      .int()
      .positive()
      .default(7 * 24),
    /** Lifetime of password-reset links, in minutes. */
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),
    /** How long a password re-check stays valid for sensitive changes, in seconds. */
    REAUTH_TTL_SECONDS: z.coerce.number().int().positive().default(300),

    /**
     * Which outbound message providers to register.
     *
     * `mock` captures messages in memory and reaches nothing, for tests and the local preview.
     * Anything else uses the real providers, so a deployment cannot end up on the mock by
     * forgetting to set this.
     */
    MESSAGING_PROVIDER: z.enum(['live', 'mock']).default('live'),

    /**
     * Which transport delivers outbound support callbacks.
     *
     * `mock` records deliveries in memory and opens no socket, for tests and the local preview.
     * Its own variable rather than a reuse of `MESSAGING_PROVIDER`: a deployment that mails through
     * a real SMTP server may still want callbacks captured while a customer's endpoint is being
     * built, and folding two independent decisions into one switch makes neither adjustable.
     */
    SUPPORT_CALLBACK_TRANSPORT: z.enum(['live', 'mock']).default('live'),

    /**
     * Which AI text-generation provider to register.
     *
     * `mock` builds summaries from the prompt's own source records and reaches nothing, for tests
     * and the local preview. `http` uses the configurable HTTP adapter, whose endpoint, model and
     * credential come from the tenant's AI integration connection — no vendor is named here or
     * anywhere else in the code.
     */
    AI_PROVIDER: z.enum(['http', 'mock']).default('mock'),
    /** How long a single generation call may take before it is abandoned. */
    AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000).default(30_000),
    /** How many times a retryable generation failure is retried by the queue. */
    AI_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),

    /**
     * Which IVR adapter to register.
     *
     * `mock` places no telephone call: it records what would have been asked of the provider and
     * hands back a call id, so tests and the local preview exercise the whole routing, fallback
     * and recording path without a telephony account. `tata` is the real adapter. The default is
     * the real one, so a deployment cannot end up on the mock by forgetting to set this.
     *
     * The provider's credentials and webhook secret are *not* here. They are per tenant, in the
     * IVR integration connection, encrypted at rest.
     */
    IVR_PROVIDER: z.enum(['tata', 'mock']).default('tata'),
    /** How long a minted recording playback URL stays valid. Short by design. */
    IVR_RECORDING_URL_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(300),

    /**
     * Where a tenant's design tokens come from.
     *
     * `local` is the organization's own stored branding — what Desk has always done, and what
     * every deployment gets unless somebody decides otherwise. `remote` reads from an Ashniva
     * Theme Manager through the tenant's Theme Manager integration connection.
     *
     * The default is `local`, which is the opposite of `IVR_PROVIDER`'s reasoning and deliberately
     * so. There the real adapter is the default because forgetting the variable must not silently
     * disable telephony. Here the *local* source is the one that always works: it depends on
     * nothing outside the deployment, and a theme is not a feature anybody should be able to
     * disable Desk by getting wrong. Choosing `remote` is a decision somebody makes; landing on it
     * by accident is not.
     */
    THEME_PROVIDER: z.enum(['local', 'remote']).default('local'),
    /**
     * How long a theme document fetched from a Theme Manager is served before it is refreshed.
     *
     * The refresh happens in the background and the cached document is served meanwhile, so this
     * bounds staleness, not latency — no request ever waits on the Theme Manager.
     */
    THEME_CACHE_TTL_SECONDS: z.coerce.number().int().positive().max(86_400).default(300),
    /** How long a single theme fetch may take before it is abandoned and the cache is kept. */
    THEME_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(5_000),
  })
  /**
   * Fail at startup, not at the first save.
   *
   * Without this the API boots happily with no encryption key and only throws when someone tries
   * to store a provider credential — a deployment that looks healthy in every check and breaks
   * the first time it is used for real. A missing or malformed key is a configuration error, so
   * it stops the process here.
   *
   * The length is validated here too, for the same reason: a 16-byte key would otherwise pass
   * startup and fail later inside the cipher.
   */
  .superRefine((env, ctx) => {
    const key = env.APP_ENCRYPTION_KEY;

    if (env.NODE_ENV === 'production' && !key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APP_ENCRYPTION_KEY'],
        message:
          'APP_ENCRYPTION_KEY is required in production. Generate one with: openssl rand -base64 32',
      });
      return;
    }

    if (key && Buffer.from(key, 'base64').length !== 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APP_ENCRYPTION_KEY'],
        message: 'APP_ENCRYPTION_KEY must decode to exactly 32 bytes (openssl rand -base64 32)',
      });
    }
  })
  /**
   * The settings whose *development* value is a working configuration and a production incident.
   *
   * Each of these has a default or an example value that lets a developer start the app in one
   * command. None of them fails loudly when it survives into production: a placeholder JWT secret
   * signs tokens perfectly well, an empty CORS list only breaks the browser, a localhost web URL
   * only breaks the links in mail somebody else receives, and auto-creating a bucket only hides
   * that the name is wrong until the day someone looks for the files. So production refuses them
   * here, at startup, where the failure is one message instead of a week of confusion.
   *
   * `TRUST_PROXY` is the same class of problem read the other way round: its development value is
   * not a placeholder but an *absence*, and an absence behind a load balancer silently drops
   * `Secure` from the refresh cookie. So production insists it be stated, either way.
   */
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') {
      return;
    }

    for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      const reason = placeholderSecretReason(env[name]);
      if (reason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [name],
          message:
            `${name} looks like a placeholder — ${reason}. Generate one with: ` +
            "node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\"",
        });
      }
    }

    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message:
          'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ, or a stolen access token can be ' +
          'replayed as a refresh token.',
      });
    }

    if (env.CORS_ORIGINS.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message:
          'CORS_ORIGINS is required in production. List the exact origins the web and portal apps ' +
          'are served from, comma-separated.',
      });
    }

    if (!env.APP_WEB_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APP_WEB_URL'],
        message:
          'APP_WEB_URL is required in production. Invitation and password-reset links are built ' +
          'from it, so without it every one of them would point at localhost.',
      });
    }

    if (env.TRUST_PROXY === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TRUST_PROXY'],
        message:
          'TRUST_PROXY must be stated in production. Set it to the number of proxies in front of ' +
          'the API (1 for a single load balancer or ingress), or to false when the API is the ' +
          'only thing the internet talks to. Left unset behind a proxy, req.secure is false for ' +
          'every request: the refresh cookie goes out without Secure on an HTTPS site, so the ' +
          'browser will send a 30-day refresh token over plain http to the same host, and every ' +
          "client shares the balancer's rate-limit bucket.",
      });
    }

    if (env.STORAGE_AUTO_CREATE_BUCKET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STORAGE_AUTO_CREATE_BUCKET'],
        message:
          'STORAGE_AUTO_CREATE_BUCKET must be false in production: it turns a mistyped ' +
          'STORAGE_BUCKET into a new, empty, unbacked-up bucket instead of an error.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
