import { SafeSmtpTransportFactory } from './safe-smtp';
import {
  BlockedDestinationError,
  SafeDestinationService,
} from '../../../infrastructure/net/safe-destination.service';
import type { AppConfigService } from '../../../config/app-config.service';
import type { EmailConfig } from './email-settings';

/**
 * Issue #22: the mail server an operator configures is a destination like any other.
 *
 * These tests are the reason the fix is not just a comment. Each one names an address family that
 * used to be reachable from the settings screen — loopback, RFC1918, link-local, the cloud
 * metadata endpoint — and asserts that no socket is opened to it.
 *
 * Two things are checked beyond "it refused":
 *
 *  * **The transport is pinned.** `host` must be the literal address, because handing nodemailer
 *    the name would let the resolver answer differently the second time and the check would have
 *    been decoration. nodemailer skips DNS when `host` is already an IP, which is what closes it.
 *  * **The name survives for TLS.** nodemailer disables SNI when the host is an address, so
 *    pinning without restoring `servername` would break certificate validation. That is asserted
 *    as explicitly as the refusals are.
 *
 * DNS is stubbed, deliberately: the point is what the factory does with a given answer, and
 * depending on the network to supply a name that resolves to `10.0.0.1` would make the suite fail
 * for the wrong reason on a bad day.
 */

const lookupMock = jest.fn();
jest.mock('node:dns/promises', () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}));

const createTransportMock = jest.fn((_options: Record<string, unknown>) => ({
  verify: jest.fn(),
  close: jest.fn(),
}));
jest.mock('nodemailer', () => ({
  createTransport: (options: Record<string, unknown>) => createTransportMock(options),
}));

function factoryWith(allowedHosts: string[] = []): SafeSmtpTransportFactory {
  return new SafeSmtpTransportFactory(new SafeDestinationService(), {
    smtp: { allowedHosts },
  } as AppConfigService);
}

function settings(over: Partial<EmailConfig> = {}): EmailConfig {
  return {
    senderName: 'Ashniva',
    senderEmail: 'desk@example.com',
    replyTo: null,
    host: 'smtp.example.com',
    port: 587,
    encryption: 'STARTTLS',
    username: 'desk',
    ...over,
  };
}

/** Resolves any name to one address, as `dns.lookup(name, {all: true})` would. */
function resolvesTo(address: string, family = 4): void {
  lookupMock.mockResolvedValue([{ address, family }]);
}

/** The options the factory handed to nodemailer on its most recent call. */
function transportOptions(): Record<string, unknown> {
  return createTransportMock.mock.calls.at(-1)?.[0] ?? {};
}

async function refusal(host: string): Promise<BlockedDestinationError> {
  try {
    await factoryWith().create(settings({ host }), 'hunter2');
  } catch (error) {
    if (error instanceof BlockedDestinationError) {
      return error;
    }
    throw error;
  }
  throw new Error(`Expected ${host} to be refused, but a transport was built for it`);
}

beforeEach(() => {
  lookupMock.mockReset();
  createTransportMock.mockClear();
});

describe('SafeSmtpTransportFactory — what may be connected to', () => {
  it('allows a public mail server', async () => {
    resolvesTo('142.250.185.109');
    await expect(factoryWith().create(settings(), 'hunter2')).resolves.toBeDefined();
    expect(transportOptions().host).toBe('142.250.185.109');
  });

  it('refuses localhost by name, without asking DNS at all', async () => {
    const error = await refusal('localhost');
    expect(error.detail).toBe('a private or loopback name');
    // The resolver is never consulted, so it cannot be made part of the attack.
    expect(lookupMock).not.toHaveBeenCalled();
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('refuses the IPv4 loopback address', async () => {
    expect((await refusal('127.0.0.1')).detail).toBe('a loopback address');
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('refuses the IPv6 loopback address', async () => {
    expect((await refusal('::1')).detail).toBe('a loopback address (::1)');
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('refuses an RFC1918 address', async () => {
    expect((await refusal('10.0.0.25')).detail).toBe('a private address (10.0.0.0/8)');
    expect((await refusal('192.168.1.10')).detail).toBe('a private address (192.168.0.0/16)');
    expect((await refusal('172.20.0.5')).detail).toBe('a private address (172.16.0.0/12)');
  });

  it('refuses a link-local address', async () => {
    expect((await refusal('169.254.10.1')).detail).toBe('a link-local address');
    expect((await refusal('fe80::1')).detail).toBe('a link-local address (fe80::/10)');
  });

  it('refuses a unique-local IPv6 address', async () => {
    expect((await refusal('fd00::1')).detail).toBe('a unique-local address (fc00::/7)');
  });

  it('refuses the cloud metadata address', async () => {
    expect((await refusal('169.254.169.254')).detail).toBe('the cloud metadata service');
  });

  it('refuses a CGNAT address', async () => {
    expect((await refusal('100.70.0.1')).detail).toBe(
      'a carrier-grade NAT address (100.64.0.0/10)',
    );
  });

  it('refuses a multicast address', async () => {
    expect((await refusal('239.255.255.250')).detail).toBe('a multicast or reserved address');
  });

  it('refuses a hostname that resolves to a private address', async () => {
    resolvesTo('10.1.2.3');
    const error = await refusal('mail.evil.example');
    expect(error.detail).toBe('a private address (10.0.0.0/8)');
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('refuses a hostname that resolves to the metadata address', async () => {
    resolvesTo('169.254.169.254');
    expect((await refusal('mail.evil.example')).detail).toBe('the cloud metadata service');
  });

  it('refuses a name that answers with one public and one private address', async () => {
    // The rebinding case. Connecting to the public one and calling it safe would make the verdict
    // depend on resolver ordering, which the attacker influences and we do not.
    lookupMock.mockResolvedValue([
      { address: '142.250.185.109', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    expect((await refusal('mail.evil.example')).detail).toBe('a loopback address');
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('refuses an IPv4-mapped IPv6 spelling of the loopback address', async () => {
    // `::ffff:127.0.0.1` reaches the loopback interface exactly as `127.0.0.1` does.
    expect((await refusal('::ffff:127.0.0.1')).detail).toBe('a loopback address');
  });

  it('refuses a name that does not resolve', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND'));
    expect((await refusal('nowhere.example')).detail).toBe('a name that does not resolve');
  });
});

describe('SafeSmtpTransportFactory — the allow-list', () => {
  it('lets a named relay resolve inside the private network', async () => {
    resolvesTo('10.1.2.3');
    await expect(
      factoryWith(['mail.internal.example']).create(
        settings({ host: 'mail.internal.example' }),
        'hunter2',
      ),
    ).resolves.toBeDefined();
    // Still pinned: an allow-listed name cannot be used to reach a different host on a later
    // resolution.
    expect(transportOptions().host).toBe('10.1.2.3');
    expect(transportOptions().servername).toBe('mail.internal.example');
  });

  it('widens the rule for that host and nothing else', async () => {
    resolvesTo('10.1.2.3');
    const factory = factoryWith(['mail.internal.example']);
    await expect(
      factory.create(settings({ host: 'other.internal.example' }), 'hunter2'),
    ).rejects.toBeInstanceOf(BlockedDestinationError);
  });

  it('is a separate list from the HTTP one, so a relay is not opened to the integrations', () => {
    // Asserted structurally: the factory reads `config.smtp`, and nothing here consults
    // `config.outbound`. A shared list would have made naming a relay widen five HTTP call sites.
    const config = { smtp: { allowedHosts: ['mail.internal.example'] } } as AppConfigService;
    expect(() => new SafeSmtpTransportFactory(new SafeDestinationService(), config)).not.toThrow();
    expect(Object.keys(config)).not.toContain('outbound');
  });
});

describe('SafeSmtpTransportFactory — TLS and credentials', () => {
  it('connects to the address but verifies the certificate against the name', async () => {
    resolvesTo('142.250.185.109');
    await factoryWith().create(settings({ host: 'smtp.gmail.com' }), 'hunter2');
    const options = transportOptions();

    expect(options.host).toBe('142.250.185.109');
    // Both spellings: nodemailer reads the top-level one, and the `tls` block is what reaches
    // `tls.connect`. Without them SNI would be disabled outright, because the host is an address.
    expect(options.servername).toBe('smtp.gmail.com');
    expect(options.tls).toEqual({ servername: 'smtp.gmail.com' });
  });

  it('keeps implicit TLS implicit and STARTTLS explicit', async () => {
    resolvesTo('142.250.185.109');
    await factoryWith().create(settings({ encryption: 'TLS', port: 465 }), 'hunter2');
    expect(transportOptions()).toMatchObject({ secure: true, requireTLS: false });

    await factoryWith().create(settings({ encryption: 'STARTTLS', port: 587 }), 'hunter2');
    expect(transportOptions()).toMatchObject({ secure: false, requireTLS: true });
  });

  it('passes the credential to nodemailer and puts it in no error message', async () => {
    resolvesTo('142.250.185.109');
    await factoryWith().create(settings(), 'hunter2');
    expect(transportOptions().auth).toEqual({ user: 'desk', pass: 'hunter2' });

    // The refusal path carries the host and the rule, and never the password — this is the string
    // that reaches the settings screen and the failure record.
    const error = await refusal('127.0.0.1');
    expect(error.message).not.toContain('hunter2');
    expect(JSON.stringify(error)).not.toContain('hunter2');
  });

  it('sends no credential when the tenant configured none', async () => {
    resolvesTo('142.250.185.109');
    await factoryWith().create(settings({ username: null }), null);
    expect(transportOptions().auth).toBeUndefined();
  });
});
