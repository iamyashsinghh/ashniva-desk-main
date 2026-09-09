import { checkAddress, isForbiddenHostname } from './address-rules';

/**
 * The deny-list, exhaustively.
 *
 * These are pure functions over strings, so every case can be stated outright instead of being
 * approximated with a socket. A hole here is a hole in every outbound integration at once, which
 * is why the spellings that mean the same address — `::1`, `::ffff:127.0.0.1`, `0:0:0:0:0:0:0:1`
 * — are each written out rather than assumed to normalise.
 */

describe('checkAddress — allowed', () => {
  it.each(['8.8.8.8', '1.1.1.1', '140.82.121.4', '2606:4700:4700::1111', '2001:4860:4860::8888'])(
    'allows the public address %s',
    (address) => {
      expect(checkAddress(address)).toEqual({ allowed: true });
    },
  );
});

describe('checkAddress — IPv4', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['127.1.2.3', 'loopback'],
    ['10.0.0.1', 'private'],
    ['10.255.255.255', 'private'],
    ['172.16.0.1', 'private'],
    ['172.31.255.254', 'private'],
    ['192.168.1.1', 'private'],
    ['169.254.1.1', 'link-local'],
    ['169.254.169.254', 'metadata'],
    ['169.254.170.2', 'metadata'],
    ['100.100.100.200', 'metadata'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['0.0.0.0', 'unspecified'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
  ])('rejects %s (%s)', (address) => {
    expect(checkAddress(address).allowed).toBe(false);
  });

  it('does not over-reach into neighbouring public ranges', () => {
    // 172.15 and 172.32 sit either side of the private block; 11.x and 9.x either side of 10/8.
    for (const address of ['172.15.0.1', '172.32.0.1', '11.0.0.1', '9.255.255.255', '128.0.0.1']) {
      expect({ address, ...checkAddress(address) }).toEqual({ address, allowed: true });
    }
  });
});

describe('checkAddress — IPv6', () => {
  it.each([
    ['::1', 'loopback'],
    ['0:0:0:0:0:0:0:1', 'loopback, written out'],
    ['::', 'unspecified'],
    ['fe80::1', 'link-local'],
    ['fe80::abcd:1234:5678:9abc', 'link-local'],
    ['fc00::1', 'unique-local'],
    ['fd12:3456:789a::1', 'unique-local'],
    ['ff02::1', 'multicast'],
    ['fd00:ec2::254', 'metadata'],
  ])('rejects %s (%s)', (address) => {
    expect(checkAddress(address).allowed).toBe(false);
  });

  it('rejects an IPv4 destination wearing an IPv6 spelling', () => {
    // The whole point of the mapped-address branch: these reach the loopback and private
    // interfaces exactly as their IPv4 forms do.
    for (const address of ['::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:169.254.169.254']) {
      expect({ address, allowed: checkAddress(address).allowed }).toEqual({
        address,
        allowed: false,
      });
    }
  });

  it('still allows a public IPv4-mapped address', () => {
    expect(checkAddress('::ffff:8.8.8.8')).toEqual({ allowed: true });
  });

  it('rejects a link-local address carrying a zone index', () => {
    expect(checkAddress('fe80::1%eth0').allowed).toBe(false);
  });

  /**
   * A refusal has to name the right rule, not merely refuse.
   *
   * `::1` fits the shape of an IPv4-compatible address — twelve zero bytes and a non-zero tail —
   * so before the branches were reordered it was re-checked under the IPv4 rules and reported as
   * `the unspecified address (0.0.0.0/8)`. It was still refused, which is why nothing caught it:
   * the older tests asserted `allowed` and never the reason. An operator reading that message
   * would have gone looking for the wrong misconfiguration.
   */
  it.each([
    ['::1', 'a loopback address (::1)'],
    ['0:0:0:0:0:0:0:1', 'a loopback address (::1)'],
    ['::', 'the unspecified address (::)'],
    ['::ffff:127.0.0.1', 'a loopback address'],
    ['::ffff:10.0.0.1', 'a private address (10.0.0.0/8)'],
    ['fe80::1', 'a link-local address (fe80::/10)'],
    ['fd00::1', 'a unique-local address (fc00::/7)'],
  ])('says why it refused %s', (address, reason) => {
    expect(checkAddress(address)).toEqual({ allowed: false, reason });
  });
});

describe('checkAddress — malformed', () => {
  it.each(['', 'not-an-address', '999.999.999.999', '10.0.0', 'http://8.8.8.8'])(
    'rejects %p rather than guessing',
    (value) => {
      expect(checkAddress(value).allowed).toBe(false);
    },
  );
});

describe('isForbiddenHostname', () => {
  it.each(['localhost', 'LOCALHOST', 'localhost.', 'ip6-localhost', 'metadata.google.internal'])(
    'refuses %s before DNS is consulted',
    (hostname) => {
      expect(isForbiddenHostname(hostname)).toBe(true);
    },
  );

  it('refuses the private zones by suffix', () => {
    expect(isForbiddenHostname('printer.local')).toBe(true);
    expect(isForbiddenHostname('db.internal')).toBe(true);
  });

  it('allows ordinary public names', () => {
    for (const hostname of ['api.github.com', 'gitlab.example.com', 'graph.facebook.com']) {
      expect({ hostname, forbidden: isForbiddenHostname(hostname) }).toEqual({
        hostname,
        forbidden: false,
      });
    }
  });
});
