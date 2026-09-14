import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from './env.schema';

/**
 * Typed, grouped access to configuration. Inject this instead of reading process.env
 * so every setting has exactly one definition (env.schema.ts) and one accessor (here).
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<Env, true>) {}

  private get<Key extends keyof Env>(key: Key): Env[Key] {
    return this.configService.get(key, { infer: true });
  }

  get environment(): Env['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.environment === 'production';
  }

  get server() {
    return {
      port: this.get('PORT'),
      timezone: this.get('APP_TIMEZONE'),
      /**
       * Hop count for Express's `trust proxy`, or false when nothing fronts the API.
       *
       * Unset is read as `false` here and nowhere else: the schema leaves it undefined so that
       * production can tell "nobody said" from "somebody said no proxy" and refuse the first.
       */
      trustProxy: this.get('TRUST_PROXY') ?? false,
    };
  }

  /**
   * Whether `/api/docs` is served. Unset means on outside production; see `API_DOCS_ENABLED`.
   */
  get apiDocsEnabled(): boolean {
    return this.get('API_DOCS_ENABLED') ?? !this.isProduction;
  }

  get metrics() {
    return { token: this.get('METRICS_TOKEN') };
  }

  get queue() {
    return { shutdownGraceMs: this.get('QUEUE_SHUTDOWN_GRACE_MS') };
  }

  get logging() {
    return { level: this.get('LOG_LEVEL') };
  }

  get database() {
    return {
      url: this.get('DATABASE_URL'),
      poolMax: this.get('DB_POOL_MAX'),
      idleTimeoutMs: this.get('DB_POOL_IDLE_TIMEOUT_MS'),
      acquireTimeoutMs: this.get('DB_POOL_ACQUIRE_TIMEOUT_MS'),
      statementTimeoutMs: this.get('DB_STATEMENT_TIMEOUT_MS'),
    };
  }

  get redis() {
    return { url: this.get('REDIS_URL') };
  }

  get storage() {
    return {
      provider: this.get('STORAGE_PROVIDER'),
      localPath: this.get('STORAGE_LOCAL_PATH'),
      endpoint: this.get('STORAGE_ENDPOINT'),
      region: this.get('STORAGE_REGION'),
      bucket: this.get('STORAGE_BUCKET'),
      accessKey: this.get('STORAGE_ACCESS_KEY'),
      secretKey: this.get('STORAGE_SECRET_KEY'),
      forcePathStyle: this.get('STORAGE_FORCE_PATH_STYLE'),
      autoCreateBucket: this.get('STORAGE_AUTO_CREATE_BUCKET'),
    };
  }

  get jwt() {
    return {
      accessSecret: this.get('JWT_ACCESS_SECRET'),
      refreshSecret: this.get('JWT_REFRESH_SECRET'),
      accessTtlSeconds: this.get('JWT_ACCESS_TTL_SECONDS'),
      refreshTtlSeconds: this.get('JWT_REFRESH_TTL_SECONDS'),
    };
  }

  get app() {
    return {
      // The development fallback lives here rather than in the schema, so production can require
      // the setting instead of inheriting a value nobody chose. See APP_WEB_URL in env.schema.ts.
      webUrl: (this.get('APP_WEB_URL') ?? 'http://localhost:5173').replace(/\/$/, ''),
      timezone: this.get('APP_TIMEZONE'),
      invitationTtlHours: this.get('INVITATION_TTL_HOURS'),
      passwordResetTtlMinutes: this.get('PASSWORD_RESET_TTL_MINUTES'),
      reauthTtlSeconds: this.get('REAUTH_TTL_SECONDS'),
    };
  }

  get messaging() {
    return { useMockProviders: this.get('MESSAGING_PROVIDER') === 'mock' };
  }

  get supportCallbacks() {
    return { useMockTransport: this.get('SUPPORT_CALLBACK_TRANSPORT') === 'mock' };
  }

  get outbound() {
    return {
      allowedHosts: this.get('OUTBOUND_ALLOWED_HOSTS').map((host) => host.toLowerCase()),
    };
  }

  /** The SMTP allow-list is its own list; see `SMTP_ALLOWED_HOSTS` for why it is not shared. */
  get smtp() {
    return {
      allowedHosts: this.get('SMTP_ALLOWED_HOSTS').map((host) => host.toLowerCase()),
    };
  }

  get ivr() {
    return {
      useMockProvider: this.get('IVR_PROVIDER') === 'mock',
      recordingUrlTtlSeconds: this.get('IVR_RECORDING_URL_TTL_SECONDS'),
    };
  }

  get theme() {
    return {
      useRemoteSource: this.get('THEME_PROVIDER') === 'remote',
      cacheTtlSeconds: this.get('THEME_CACHE_TTL_SECONDS'),
      requestTimeoutMs: this.get('THEME_REQUEST_TIMEOUT_MS'),
    };
  }

  get ai() {
    return {
      useMockProvider: this.get('AI_PROVIDER') === 'mock',
      timeoutMs: this.get('AI_REQUEST_TIMEOUT_MS'),
      maxAttempts: this.get('AI_MAX_ATTEMPTS'),
    };
  }

  get gemini() {
    return {
      apiKey: this.get('GEMINI_API_KEY'),
      model: this.get('GEMINI_MODEL'),
      timeoutMs: this.get('GEMINI_REQUEST_TIMEOUT_MS'),
    };
  }

  get encryption() {
    return { key: this.get('APP_ENCRYPTION_KEY') };
  }

  get cors() {
    return { origins: this.get('CORS_ORIGINS') };
  }

  get rateLimit() {
    return {
      ttlSeconds: this.get('RATE_LIMIT_TTL_SECONDS'),
      maxRequests: this.get('RATE_LIMIT_MAX'),
    };
  }
}
