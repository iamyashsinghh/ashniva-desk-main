import { createServer, get, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import pinoHttp from 'pino-http';

import { buildPinoHttpOptions } from './pino-options';

interface LoggedLine {
  req?: { id?: string; method?: string; route?: string; url?: string; headers?: unknown };
  res?: { statusCode?: number };
  responseTime?: number;
}

/**
 * Drives a real request through the real pino-http middleware, configured exactly as the
 * application configures it, and returns what was written to the log.
 *
 * A server rather than a hand-made pair of objects: `autoLogging` writes its line from the
 * response's `finish` event, and the request serializer is wrapped by pino-http rather than
 * called directly, so only a genuine request exercises the path that leaks.
 */
async function logOfRequest(
  path: string,
  route: string | undefined,
): Promise<{ line: string; entry: LoggedLine }> {
  let write: (line: string) => void = () => {};
  const written = new Promise<string>((resolve) => {
    write = resolve;
  });
  const middleware = pinoHttp(
    buildPinoHttpOptions({ environment: 'test', logging: { level: 'info' } }),
    { write: (line: string) => write(line) },
  );
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    // What Express puts on the request once its router has matched a route; Nest's HTTP layer is
    // Express, so this is the shape `routePattern` reads in production.
    Object.assign(request, { baseUrl: '', route: route ? { path: route } : undefined });
    middleware(request, response);
    response.end('{}');
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) => {
    get({ host: '127.0.0.1', port, path }, (response) => {
      response.resume();
      response.on('end', resolve);
    }).on('error', reject);
  });
  const line = await written;
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  return { line, entry: JSON.parse(line) as LoggedLine };
}

describe('request logging', () => {
  const INVITATION_TOKEN = 'MHo3aVhqcW5mVnJUb2t2WmR2b2hLZw';

  it('does not write an invitation token to the log', async () => {
    // The token in this path is bearer-equivalent: POST /auth/invitations/accept turns it into a
    // password and a full session, so a log line carrying it is a credential at rest.
    const { line, entry } = await logOfRequest(
      `/api/v1/auth/invitations/${INVITATION_TOKEN}`,
      '/api/v1/auth/invitations/:token',
    );
    expect(line).not.toContain(INVITATION_TOKEN);
    expect(entry.req?.url).toBeUndefined();
    expect(entry.req?.route).toBe('/api/v1/auth/invitations/:token');
  });

  it('does not write a webhook verification token from the query string to the log', async () => {
    const { line } = await logOfRequest(
      '/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=s3cret-verify-token',
      '/api/v1/webhooks/whatsapp',
    );
    expect(line).not.toContain('s3cret-verify-token');
  });

  it('still says enough to debug a request: method, route, status, duration and request id', async () => {
    const { entry } = await logOfRequest('/api/v1/tickets/abc', '/api/v1/tickets/:id');
    expect(entry.req?.method).toBe('GET');
    expect(entry.req?.route).toBe('/api/v1/tickets/:id');
    expect(entry.req?.id).toBeDefined();
    expect(entry.res?.statusCode).toBe(200);
    expect(typeof entry.responseTime).toBe('number');
  });

  it('reports a request that matched no route without falling back to its URL', async () => {
    const { line, entry } = await logOfRequest('/api/v1/auth/invitations/leaky-token', undefined);
    expect(line).not.toContain('leaky-token');
    expect(entry.req?.route).toBe('unmatched');
  });
});
