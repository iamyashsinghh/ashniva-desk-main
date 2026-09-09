import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The two files that have to agree for the API's trusted-hop setting to mean anything.
 *
 * `TRUST_PROXY=1` tells the API to believe the last entry of `X-Forwarded-For` and the value of
 * `X-Forwarded-Proto`, because whoever spoke to it directly is assumed to have written them. That
 * assumption holds only while nginx is the *sole* ingress and nginx actually writes them. Both
 * halves live outside the TypeScript the rest of the suite covers — one in `docker-compose.yml`,
 * one in `nginx.conf` — and both were wrong: the API published port 3000 on every interface, and
 * the `/ws/` location forwarded neither header while a comment in the compose file said it did.
 *
 * Read as text rather than parsed: what is being asserted is a property of the file somebody edits.
 */
const REPO_FILE = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const nginxConf = REPO_FILE('../../nginx.conf');
const composeFile = REPO_FILE('../../../../docker-compose.yml');

/** Each `location … { … }` block of the nginx config, by its path. */
function locationBlocks(config: string): Map<string, string> {
  const blocks = new Map<string, string>();
  const pattern = /location\s+(\S+)\s*\{([^}]*)\}/g;
  for (const match of config.matchAll(pattern)) {
    const [, path = '', body = ''] = match;
    blocks.set(path, body);
  }
  return blocks;
}

describe('nginx forwards what the API is configured to trust', () => {
  const blocks = locationBlocks(nginxConf);

  it('has a block for the API and one for the websocket', () => {
    expect([...blocks.keys()]).toEqual(expect.arrayContaining(['/api/', '/ws/']));
  });

  it.each(['/api/', '/ws/'])(
    'sets the client address and scheme on %s, which proxies to the API',
    (path) => {
      const body = blocks.get(path) ?? '';
      expect(body).toContain('proxy_pass http://api:3000');
      // Without these two the API — trusting one hop — reads the web container's address as the
      // client's, so every visitor shares one rate-limit bucket, and reads plain http as the
      // scheme, so the refresh cookie loses `Secure` on an HTTPS site.
      expect(body).toMatch(/proxy_set_header\s+X-Forwarded-For\s+\$proxy_add_x_forwarded_for;/);
      expect(body).toMatch(/proxy_set_header\s+X-Forwarded-Proto\s+\$scheme;/);
    },
  );
});

describe('the API container is not a second ingress', () => {
  it('trusts exactly the hop nginx provides', () => {
    expect(composeFile).toMatch(/TRUST_PROXY:\s*'1'/);
  });

  it('publishes the API port on loopback only', () => {
    // Published on 0.0.0.0 the API is reachable without traversing nginx, and for those requests
    // the trusted hop is the caller: it picks its own X-Forwarded-For (its own rate-limit bucket)
    // and its own X-Forwarded-Proto (a `Secure` cookie over plain http). Loopback keeps the
    // preview scripts, the health check and the CI smoke test working and offers nothing to the
    // network. A published port with no host part fails here.
    const published = composeFile.match(/- '(?<host>[^']*):(?<container>\d+)'/g) ?? [];
    const apiPorts = published.filter((entry) => entry.endsWith(":3000'"));
    expect(apiPorts).not.toHaveLength(0);
    for (const entry of apiPorts) {
      expect(entry).toMatch(/^- '127\.0\.0\.1:/);
    }
  });
});
