import { validateEnv } from './env.validation';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  STORAGE_ENDPOINT: 'http://localhost:9000',
  STORAGE_BUCKET: 'bucket',
  STORAGE_ACCESS_KEY: 'key',
  STORAGE_SECRET_KEY: 'secret',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

/**
 * The extra settings production insists on, so a test about one of them is not drowned by the
 * other four. Each is refused on its own below.
 */
const productionEnv = {
  ...validEnv,
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'Kx7mQz2Vb9Ld4Rn6Ty1Wp3Hs5Jf8Gc0Ae2Ui4Oy6Bq8Zn',
  JWT_REFRESH_SECRET: 'Rv3Nq8Dj5Xw1Pc7Ml2Kb9Th4Sg6Fz0Ya8Ue3Iw5Oq7Cn',
  APP_ENCRYPTION_KEY: Buffer.from('a'.repeat(32)).toString('base64'),
  CORS_ORIGINS: 'https://desk.example.com',
  APP_WEB_URL: 'https://desk.example.com',
  TRUST_PROXY: '1',
};

describe('validateEnv', () => {
  it('applies defaults and parses lists and booleans', () => {
    const env = validateEnv({
      ...validEnv,
      CORS_ORIGINS: 'http://a.test, http://b.test',
      STORAGE_FORCE_PATH_STYLE: 'true',
    });

    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
    expect(env.STORAGE_FORCE_PATH_STYLE).toBe(true);
    expect(env.APP_ENCRYPTION_KEY).toBeUndefined();
  });

  describe('APP_ENCRYPTION_KEY', () => {
    const key = Buffer.from('a'.repeat(32)).toString('base64');

    it('is optional outside production, so a developer can run what stores no secrets', () => {
      expect(validateEnv({ ...validEnv }).APP_ENCRYPTION_KEY).toBeUndefined();
    });

    it('is required in production, and the process stops at startup without it', () => {
      // Without this the API boots happily and only throws when someone first saves a provider
      // credential — a deployment that passes every health check and breaks on first real use.
      const { APP_ENCRYPTION_KEY: _omitted, ...withoutKey } = productionEnv;
      expect(() => validateEnv(withoutKey)).toThrow(/APP_ENCRYPTION_KEY is required in production/);
    });

    it('accepts a real 32-byte key in production', () => {
      const env = validateEnv({ ...productionEnv, APP_ENCRYPTION_KEY: key });
      expect(env.APP_ENCRYPTION_KEY).toBe(key);
    });

    it('rejects a key of the wrong length at startup rather than inside the cipher', () => {
      const short = Buffer.from('too-short').toString('base64');
      expect(() => validateEnv({ ...validEnv, APP_ENCRYPTION_KEY: short })).toThrow(
        /must decode to exactly 32 bytes/,
      );
      expect(() => validateEnv({ ...productionEnv, APP_ENCRYPTION_KEY: short })).toThrow(
        /must decode to exactly 32 bytes/,
      );
    });

    it('has no built-in default, so a missing key can never silently mean a shared key', () => {
      const env = validateEnv({ ...validEnv });
      expect(env.APP_ENCRYPTION_KEY).toBeUndefined();
    });
  });

  it('rejects short JWT secrets with a readable message', () => {
    expect(() => validateEnv({ ...validEnv, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET must be at least 32 characters/,
    );
  });

  describe('placeholder secrets in production', () => {
    // The exact strings apps/api/.env.example ships. Both are longer than 32 characters, so the
    // length rule passed them, and both are in the repository — a signing key an attacker can
    // read. Asserted verbatim so that changing the example file without changing this check
    // fails here rather than in production.
    const EXAMPLE_ACCESS = 'local-dev-access-secret-please-change-0123456789';
    const EXAMPLE_REFRESH = 'local-dev-refresh-secret-please-change-0123456789';

    it('refuses the exact values .env.example ships', () => {
      expect(EXAMPLE_ACCESS.length).toBeGreaterThanOrEqual(32);
      expect(() =>
        validateEnv({
          ...productionEnv,
          JWT_ACCESS_SECRET: EXAMPLE_ACCESS,
          JWT_REFRESH_SECRET: EXAMPLE_REFRESH,
        }),
      ).toThrow(/JWT_ACCESS_SECRET looks like a placeholder/);
    });

    it('refuses a secret that reads as a placeholder', () => {
      expect(() =>
        validateEnv({ ...productionEnv, JWT_ACCESS_SECRET: 'ChangeMe-0123456789-0123456789-abc' }),
      ).toThrow(/JWT_ACCESS_SECRET looks like a placeholder/);
    });

    it('refuses a long secret with almost no distinct characters', () => {
      expect(() => validateEnv({ ...productionEnv, JWT_REFRESH_SECRET: 'ab'.repeat(24) })).toThrow(
        /JWT_REFRESH_SECRET looks like a placeholder/,
      );
    });

    it('refuses one secret used for both tokens', () => {
      const shared = productionEnv.JWT_ACCESS_SECRET;
      expect(() =>
        validateEnv({ ...productionEnv, JWT_ACCESS_SECRET: shared, JWT_REFRESH_SECRET: shared }),
      ).toThrow(/must differ/);
    });

    it('leaves development alone, so the example file still runs the app', () => {
      const env = validateEnv({
        ...validEnv,
        JWT_ACCESS_SECRET: EXAMPLE_ACCESS,
        JWT_REFRESH_SECRET: EXAMPLE_REFRESH,
      });
      expect(env.JWT_ACCESS_SECRET).toBe(EXAMPLE_ACCESS);
    });
  });

  describe('the settings whose development value is a production incident', () => {
    it('requires CORS_ORIGINS in production', () => {
      const { CORS_ORIGINS: _omitted, ...withoutOrigins } = productionEnv;
      expect(() => validateEnv(withoutOrigins)).toThrow(/CORS_ORIGINS is required in production/);
    });

    it('requires APP_WEB_URL in production, so invitation links are never a leftover default', () => {
      const { APP_WEB_URL: _omitted, ...withoutWebUrl } = productionEnv;
      expect(() => validateEnv(withoutWebUrl)).toThrow(/APP_WEB_URL is required in production/);
    });

    it('accepts a localhost APP_WEB_URL somebody chose on purpose', () => {
      // The docker-compose preview runs with NODE_ENV=production and really does serve the web
      // app on localhost. What must not happen is a deployment inheriting a value nobody picked.
      const env = validateEnv({ ...productionEnv, APP_WEB_URL: 'http://localhost:5173' });
      expect(env.APP_WEB_URL).toBe('http://localhost:5173');
    });

    it('falls back to localhost outside production', () => {
      expect(validateEnv({ ...validEnv }).APP_WEB_URL).toBeUndefined();
    });

    it('refuses STORAGE_AUTO_CREATE_BUCKET in production', () => {
      expect(() => validateEnv({ ...productionEnv, STORAGE_AUTO_CREATE_BUCKET: 'true' })).toThrow(
        /STORAGE_AUTO_CREATE_BUCKET must be false in production/,
      );
    });

    it('accepts a fully configured production environment', () => {
      const env = validateEnv(productionEnv);
      expect(env.NODE_ENV).toBe('production');
      expect(env.STORAGE_AUTO_CREATE_BUCKET).toBe(false);
    });
  });

  describe('TRUST_PROXY', () => {
    it('is left undefined when nobody says, and AppConfigService reads that as trusting nothing', () => {
      // Undefined rather than false, so production below can tell "nobody said" from "somebody
      // said there is no proxy". Outside production the two are the same answer.
      expect(validateEnv({ ...validEnv }).TRUST_PROXY).toBeUndefined();
    });

    it('accepts an explicit opt-out', () => {
      expect(validateEnv({ ...validEnv, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
    });

    it('accepts a hop count', () => {
      expect(validateEnv({ ...validEnv, TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
    });

    it('refuses a blanket true, which would let a client choose its own rate-limit bucket', () => {
      expect(() => validateEnv({ ...validEnv, TRUST_PROXY: 'true' })).toThrow(/number of proxies/);
    });

    it('refuses anything that is not a count', () => {
      expect(() => validateEnv({ ...validEnv, TRUST_PROXY: 'loopback' })).toThrow(/TRUST_PROXY/);
    });

    it('refuses a production environment that never states it', () => {
      // The upgrade this closes. An existing deployment behind nginx or an ALB that takes this
      // release without adding TRUST_PROXY gets req.secure === false on every request, so the
      // refresh cookie loses `Secure` on an HTTPS site and the browser is then entitled to send a
      // 30-day refresh token over plain http to the same host. Nothing else fails, and nothing
      // else says anything — which is why the answer has to be stated rather than inherited.
      const { TRUST_PROXY: _omitted, ...withoutTrustProxy } = productionEnv;
      expect(() => validateEnv(withoutTrustProxy)).toThrow(
        /TRUST_PROXY must be stated in production/,
      );
    });

    it('accepts an explicit opt-out in production, for an API that really is the ingress', () => {
      const env = validateEnv({ ...productionEnv, TRUST_PROXY: 'false' });
      expect(env.TRUST_PROXY).toBe(false);
    });

    it('still refuses a blanket true in production, so the hop count stays unforgeable', () => {
      expect(() => validateEnv({ ...productionEnv, TRUST_PROXY: 'true' })).toThrow(
        /number of proxies/,
      );
    });
  });

  describe('API_DOCS_ENABLED', () => {
    it('is unset by default, so the environment decides', () => {
      expect(validateEnv({ ...validEnv }).API_DOCS_ENABLED).toBeUndefined();
    });

    it('can be set explicitly in either direction', () => {
      expect(validateEnv({ ...validEnv, API_DOCS_ENABLED: 'false' }).API_DOCS_ENABLED).toBe(false);
      expect(validateEnv({ ...productionEnv, API_DOCS_ENABLED: 'true' }).API_DOCS_ENABLED).toBe(
        true,
      );
    });
  });

  it('lists every missing variable', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL[\s\S]*REDIS_URL/);
  });
});
