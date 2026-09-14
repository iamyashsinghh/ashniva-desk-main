import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { BlockedRequestError, SafeHttpService } from './safe-http.service';
import { SafeDestinationService } from '../net/safe-destination.service';
import type { AppConfigService } from '../../config/app-config.service';

/**
 * The guard, from the outside.
 *
 * `address-rules.spec.ts` proves which addresses are refused; this file proves that the service
 * actually consults those rules at every point it must — before the first connection, and again
 * on every redirect hop. The redirect case runs against a real server, because "we re-check the
 * hop" is a claim about control flow that a stubbed fetch could pass without being true.
 *
 * DNS is stubbed for the resolution cases. That is not a shortcut: the point of those tests is
 * what the service does with a given answer, and depending on the network to supply a name that
 * resolves to `10.0.0.1` would make the suite fail for the wrong reason on a bad day.
 */

const lookupMock = jest.fn();
jest.mock('node:dns/promises', () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}));

function serviceWith(allowedHosts: string[] = []): SafeHttpService {
  // The real resolver, not a stub: these tests are about the guard as a whole, and a stubbed
  // destination service would let a broken rule pass.
  return new SafeHttpService(
    { outbound: { allowedHosts } } as AppConfigService,
    new SafeDestinationService(),
  );
}

/** Resolves any name to one address, as `dns.lookup(name, {all: true})` would. */
function resolvesTo(address: string, family = 4): void {
  lookupMock.mockResolvedValue([{ address, family }]);
}

/** One header value, however Node happened to hand it over. */
function asText(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(', ') : value;
}

beforeEach(() => {
  lookupMock.mockReset();
});

describe('SafeHttpService.check — what may be called', () => {
  it('allows a public HTTPS destination', async () => {
    resolvesTo('140.82.121.4');
    await expect(serviceWith().check('https://api.github.com/user')).resolves.toBeUndefined();
  });

  it('rejects localhost by name, without asking DNS at all', async () => {
    await expect(serviceWith().check('https://localhost/admin')).rejects.toThrow(
      BlockedRequestError,
    );
    // The refusal must not depend on what a resolver says, so the resolver is never consulted.
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it.each([
    ['https://127.0.0.1/', 'loopback IPv4'],
    ['https://[::1]/', 'loopback IPv6'],
    ['https://10.1.2.3/', 'private IPv4'],
    ['https://192.168.0.10/', 'private IPv4'],
    ['https://169.254.1.1/', 'link-local'],
    ['https://169.254.169.254/latest/meta-data/', 'cloud metadata'],
  ])('rejects %s (%s)', async (url) => {
    await expect(serviceWith().check(url)).rejects.toThrow(BlockedRequestError);
  });

  it('rejects a hostname that resolves to a private address', async () => {
    // The attack the literal-address checks alone would miss: the URL looks entirely ordinary.
    resolvesTo('10.0.0.7');
    await expect(serviceWith().check('https://totally-normal.example.com/')).rejects.toThrow(
      /private address/,
    );
  });

  it('rejects a hostname that resolves to the metadata address', async () => {
    resolvesTo('169.254.169.254');
    await expect(serviceWith().check('https://harmless.example.com/')).rejects.toThrow(/metadata/);
  });

  it('rejects a name that resolves to both a public and a private address', async () => {
    // Answering with one of each is how a rebinding attempt hides from a check that only looks at
    // the address it happens to pick.
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(serviceWith().check('https://split-horizon.example.com/')).rejects.toThrow(
      BlockedRequestError,
    );
  });

  it.each([
    'file:///etc/passwd',
    'ftp://example.com/x',
    'gopher://example.com/',
    'data:text/plain,x',
  ])('rejects the unsupported scheme in %s', async (url) => {
    await expect(serviceWith().check(url)).rejects.toThrow(/unsupported scheme/);
  });

  it('rejects plain HTTP, which would put the credential on the wire in clear', async () => {
    resolvesTo('93.184.216.34');
    await expect(serviceWith().check('http://example.com/')).rejects.toThrow(/plain HTTP/);
  });

  it('rejects a URL that cannot be parsed', async () => {
    await expect(serviceWith().check('not a url')).rejects.toThrow(BlockedRequestError);
  });
});

describe('SafeHttpService.check — the allow-list', () => {
  it('lets a named host resolve inside the private network', async () => {
    // The documented escape hatch: a self-hosted GitLab on the operator's own network.
    resolvesTo('10.0.0.7');
    await expect(
      serviceWith(['gitlab.internal.example']).check('https://gitlab.internal.example/api/v4/user'),
    ).resolves.toBeUndefined();
  });

  it('widens the rule for that host and nothing else', async () => {
    resolvesTo('10.0.0.8');
    await expect(
      serviceWith(['gitlab.internal.example']).check('https://other.internal.example/'),
    ).rejects.toThrow(BlockedRequestError);
  });

  it('does not let an allow-listed host make plain HTTP acceptable elsewhere', async () => {
    resolvesTo('93.184.216.34');
    await expect(
      serviceWith(['gitlab.internal.example']).check('http://example.com/'),
    ).rejects.toThrow(/plain HTTP/);
  });
});

describe('SafeHttpService.fetch — redirects are re-checked', () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === '/redirect-to-metadata') {
        // A destination that was fine on the first hop sending the caller somewhere that is not.
        // Deliberately HTTPS, so that what refuses it is the address rule and not the cheaper
        // scheme rule — the claim under test is that the hop's *address* is checked again.
        response.writeHead(302, { location: 'https://169.254.169.254/latest/meta-data/' });
        response.end();
        return;
      }
      if (request.url === '/redirect-to-loopback') {
        response.writeHead(302, { location: 'https://127.0.0.1/' });
        response.end();
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, host: request.headers.host }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  /**
   * The test server is on the loopback interface, which is exactly what the guard exists to
   * refuse — so it is reached the only way anything private may be reached: by being allow-listed.
   * That makes these tests also a proof that the escape hatch works.
   */
  const allowLocal = () => {
    resolvesTo('127.0.0.1');
    return serviceWith(['staging.example.test']);
  };

  it('follows an ordinary response and returns it', async () => {
    const response = await allowLocal().fetch(`http://staging.example.test:${port}/ok`, {
      allowInsecure: true,
    });
    expect(response.status).toBe(200);
    // The Host header carries the original name, not the pinned address — virtual hosting and
    // certificate validation both depend on that.
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      host: `staging.example.test:${port}`,
    });
  });

  it('refuses a redirect that lands on the metadata service', async () => {
    await expect(
      allowLocal().fetch(`http://staging.example.test:${port}/redirect-to-metadata`, {
        allowInsecure: true,
      }),
    ).rejects.toThrow(/metadata/);
  });

  it('refuses a redirect that lands on the loopback interface', async () => {
    await expect(
      allowLocal().fetch(`http://staging.example.test:${port}/redirect-to-loopback`, {
        allowInsecure: true,
      }),
    ).rejects.toThrow(BlockedRequestError);
  });

  /**
   * The wire format has to match what `fetch` used to send.
   *
   * `http.request` falls back to `Transfer-Encoding: chunked` when no Content-Length is set, and
   * plenty of API gateways in front of the endpoints this calls refuse a chunked POST. Routing the
   * providers through this service must not change how their requests look to the far end.
   */
  it('sends a POST body with Content-Length rather than chunked', async () => {
    const seen: { length?: string; encoding?: string; body: string }[] = [];
    const echo = createServer((request, response) => {
      let received = '';
      request.on('data', (chunk: Buffer) => (received += chunk.toString('utf8')));
      request.on('end', () => {
        seen.push({
          length: request.headers['content-length'],
          encoding: request.headers['transfer-encoding'],
          body: received,
        });
        response.writeHead(200);
        response.end('{}');
      });
    });
    await new Promise<void>((resolve) => echo.listen(0, '127.0.0.1', resolve));
    const echoPort = (echo.address() as AddressInfo).port;

    try {
      // Non-ASCII on purpose: Content-Length is a byte count, and `.length` would understate it.
      const payload = JSON.stringify({ note: 'café £5' });
      await allowLocal().fetch(`http://staging.example.test:${echoPort}/`, {
        method: 'POST',
        body: payload,
        headers: { 'content-type': 'application/json' },
        allowInsecure: true,
      });

      expect(seen[0]?.encoding).toBeUndefined();
      expect(seen[0]?.length).toBe(String(Buffer.byteLength(payload, 'utf8')));
      expect(seen[0]?.body).toBe(payload);
    } finally {
      await new Promise((resolve) => echo.close(resolve));
    }
  });

  it('connects over IPv4 when a name offers both families', async () => {
    // Pinning costs us Happy Eyeballs, so an AAAA-first answer would otherwise become a hard
    // failure anywhere IPv6 does not work — something `fetch` would have survived.
    lookupMock.mockResolvedValue([
      { address: '::1', family: 6 },
      { address: '127.0.0.1', family: 4 },
    ]);
    const response = await serviceWith(['staging.example.test']).fetch(
      `http://staging.example.test:${port}/ok`,
      { allowInsecure: true },
    );
    expect(response.status).toBe(200);
  });

  it('refuses a response larger than the cap rather than buffering it', async () => {
    const big = createServer((_request, response) => {
      response.writeHead(200);
      response.end('x'.repeat(4096));
    });
    await new Promise<void>((resolve) => big.listen(0, '127.0.0.1', resolve));
    const bigPort = (big.address() as AddressInfo).port;
    try {
      await expect(
        allowLocal().fetch(`http://staging.example.test:${bigPort}/`, {
          allowInsecure: true,
          maxBytes: 1024,
        }),
      ).rejects.toThrow(/larger than/);
    } finally {
      await new Promise((resolve) => big.close(resolve));
    }
  });
});

/**
 * Where the credential goes when a hop moves.
 *
 * The address rules stop a redirect into the private network; they say nothing about a *public*
 * host that answers 302 to another public host it controls. Following that hop with the caller's
 * `Authorization` header still attached hands the bearer token — and the outbound callback
 * signature headers, which are computed over this deployment's own secret — to somebody the caller
 * never chose to authenticate to. No SSRF is needed for it; one edited redirect is enough.
 */
describe('SafeHttpService.fetch — credentials do not follow a redirect off-origin', () => {
  let origin: Server;
  let elsewhere: Server;
  let originPort: number;
  let elsewherePort: number;
  const received: { path: string; headers: Record<string, string | undefined> }[] = [];

  const record = (path: string, headers: Record<string, string | string[] | undefined>) => {
    received.push({
      path,
      headers: {
        authorization: asText(headers.authorization),
        'x-ashniva-signature': asText(headers['x-ashniva-signature']),
        'x-goog-api-key': asText(headers['x-goog-api-key']),
        'content-type': asText(headers['content-type']),
      },
    });
  };

  beforeAll(async () => {
    elsewhere = createServer((request, response) => {
      record(request.url ?? '', request.headers);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{}');
    });
    await new Promise<void>((resolve) => elsewhere.listen(0, '127.0.0.1', resolve));
    elsewherePort = (elsewhere.address() as AddressInfo).port;

    origin = createServer((request, response) => {
      record(request.url ?? '', request.headers);
      if (request.url === '/off-origin') {
        // Same host, another port — a different origin, and the cheapest one to stand up here.
        response.writeHead(302, {
          location: `http://staging.example.test:${elsewherePort}/collected`,
        });
        response.end();
        return;
      }
      if (request.url === '/same-origin') {
        response.writeHead(302, { location: '/landed' });
        response.end();
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{}');
    });
    await new Promise<void>((resolve) => origin.listen(0, '127.0.0.1', resolve));
    originPort = (origin.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => origin.close(resolve));
    await new Promise((resolve) => elsewhere.close(resolve));
  });

  beforeEach(() => {
    received.length = 0;
    resolvesTo('127.0.0.1');
  });

  const credentialed = {
    allowInsecure: true,
    headers: {
      authorization: 'Bearer super-secret-token',
      'X-Ashniva-Signature': 'sha256=deadbeef',
      'x-goog-api-key': 'gemini-secret',
      'content-type': 'application/json',
    },
  };

  it('drops the bearer token and the signature when the redirect changes origin', async () => {
    const response = await serviceWith(['staging.example.test']).fetch(
      `http://staging.example.test:${originPort}/off-origin`,
      credentialed,
    );
    expect(response.status).toBe(200);

    const [first, second] = received;
    // The hop the caller chose still carries them.
    expect(first?.headers.authorization).toBe('Bearer super-secret-token');
    expect(first?.headers['x-ashniva-signature']).toBe('sha256=deadbeef');
    expect(first?.headers['x-goog-api-key']).toBe('gemini-secret');
    // The hop it was sent to does not.
    expect(second?.path).toBe('/collected');
    expect(second?.headers.authorization).toBeUndefined();
    expect(second?.headers['x-ashniva-signature']).toBeUndefined();
    expect(second?.headers['x-goog-api-key']).toBeUndefined();
    // Everything that is not a credential travels, so the request still means what it meant.
    expect(second?.headers['content-type']).toBe('application/json');
  });

  it('keeps them across a same-origin redirect, which is an ordinary one', async () => {
    await serviceWith(['staging.example.test']).fetch(
      `http://staging.example.test:${originPort}/same-origin`,
      credentialed,
    );

    const [, second] = received;
    expect(second?.path).toBe('/landed');
    expect(second?.headers.authorization).toBe('Bearer super-secret-token');
    expect(second?.headers['x-ashniva-signature']).toBe('sha256=deadbeef');
  });
});

describe('BlockedRequestError', () => {
  it('names the host and the rule, and carries no path or query', async () => {
    resolvesTo('10.0.0.7');
    // A refusal gets logged, and the URL can carry a token in its query string.
    let error: unknown;
    try {
      await serviceWith().check('https://hook.example.com/reset?token=super-secret');
    } catch (cause) {
      error = cause;
    }

    expect(error).toBeInstanceOf(BlockedRequestError);
    const { message } = error as BlockedRequestError;
    expect(message).toContain('hook.example.com');
    expect(message).not.toContain('super-secret');
    expect(message).not.toContain('/reset');
  });
});
