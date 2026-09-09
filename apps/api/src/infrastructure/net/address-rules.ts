import { isIP } from 'node:net';

/**
 * Which IP addresses the API refuses to open a connection to.
 *
 * This is the security core of `SafeHttpService` and is kept as pure functions so it can be
 * tested exhaustively without a socket. Every rule here answers the same question: could an
 * operator who is allowed to store a URL use it to reach something that is not on the public
 * internet — another tenant's service, a database bound to the loopback interface, the cloud
 * provider's credential endpoint?
 *
 * The list is a deny-list of address *ranges* rather than of hostnames, because the attacker
 * controls the hostname and does not control what the ranges mean.
 */

/** Hostnames refused before DNS is even consulted, so a resolver cannot be part of the attack. */
const FORBIDDEN_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  // The cloud metadata services, by the names they answer to. The addresses are blocked below as
  // well; these are here so the refusal message names the real problem.
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
]);

/** `169.254.169.254` and friends: unauthenticated credential endpoints on every major cloud. */
const METADATA_ADDRESSES = new Set([
  '169.254.169.254', // AWS, Azure, GCP, DigitalOcean, OpenStack
  '169.254.170.2', // AWS ECS task metadata
  '100.100.100.200', // Alibaba Cloud
  'fd00:ec2::254', // AWS IMDSv6
]);

export type AddressVerdict = { allowed: true } | { allowed: false; reason: string };

const ALLOWED: AddressVerdict = { allowed: true };

function deny(reason: string): AddressVerdict {
  return { allowed: false, reason };
}

/** A hostname that must never be resolved, whatever the resolver would say. */
export function isForbiddenHostname(hostname: string): boolean {
  const name = hostname.toLowerCase().replace(/\.$/, '');
  if (FORBIDDEN_HOSTNAMES.has(name)) {
    return true;
  }
  // `.local` is mDNS and `.internal` is the conventional private zone; neither is routable on the
  // public internet, so a request to one is by definition a request into the private network.
  return name.endsWith('.local') || name.endsWith('.internal');
}

function checkIpv4(address: string): AddressVerdict {
  if (METADATA_ADDRESSES.has(address)) {
    return deny('the cloud metadata service');
  }
  const parts = address.split('.').map(Number);
  const [a, b] = parts as [number, number, number, number];

  if (a === 127) {
    return deny('a loopback address');
  }
  if (a === 10) {
    return deny('a private address (10.0.0.0/8)');
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return deny('a private address (172.16.0.0/12)');
  }
  if (a === 192 && b === 168) {
    return deny('a private address (192.168.0.0/16)');
  }
  if (a === 169 && b === 254) {
    return deny('a link-local address');
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return deny('a carrier-grade NAT address (100.64.0.0/10)');
  }
  if (a === 192 && b === 0) {
    return deny('a reserved address (192.0.0.0/24)');
  }
  if (a === 0) {
    return deny('the unspecified address (0.0.0.0/8)');
  }
  if (a >= 224) {
    // Multicast (224/4) and reserved/broadcast (240/4, 255.255.255.255).
    return deny('a multicast or reserved address');
  }
  return ALLOWED;
}

/**
 * Expands an IPv6 address to its sixteen bytes.
 *
 * Written out rather than pattern-matched on the text, because IPv6 has too many spellings for
 * that to be safe: `::1`, `0:0:0:0:0:0:0:1` and `::0001` are the same address, and a deny-list
 * that matches strings would catch one of them.
 */
function ipv6Bytes(address: string): number[] | null {
  const zoneless = address.split('%')[0] ?? address;
  const [head, tail] = zoneless.split('::') as [string, string | undefined];
  const parse = (part: string): string[] => (part === '' ? [] : part.split(':'));

  const left = parse(head);
  const right = tail === undefined ? [] : parse(tail);

  // A trailing IPv4 form (`::ffff:127.0.0.1`) contributes two groups, not one.
  const expand = (groups: string[]): string[] | null => {
    const out: string[] = [];
    for (const group of groups) {
      if (group.includes('.')) {
        const octets = group.split('.').map(Number);
        if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
          return null;
        }
        const [o1, o2, o3, o4] = octets as [number, number, number, number];
        out.push(((o1 << 8) | o2).toString(16), ((o3 << 8) | o4).toString(16));
      } else {
        out.push(group);
      }
    }
    return out;
  };

  const leftGroups = expand(left);
  const rightGroups = expand(right);
  if (!leftGroups || !rightGroups) {
    return null;
  }

  const missing = 8 - leftGroups.length - rightGroups.length;
  if (tail === undefined) {
    if (leftGroups.length !== 8) {
      return null;
    }
  } else if (missing < 0) {
    return null;
  }

  const groups =
    tail === undefined
      ? leftGroups
      : [...leftGroups, ...Array<string>(missing).fill('0'), ...rightGroups];

  const bytes: number[] = [];
  for (const group of groups) {
    const value = Number.parseInt(group === '' ? '0' : group, 16);
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      return null;
    }
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes.length === 16 ? bytes : null;
}

function checkIpv6(address: string): AddressVerdict {
  const normalized = (address.split('%')[0] ?? address).toLowerCase();
  if (METADATA_ADDRESSES.has(normalized)) {
    return deny('the cloud metadata service');
  }
  const bytes = ipv6Bytes(normalized);
  if (!bytes) {
    return deny('an address that could not be parsed');
  }

  // The two addresses that are all-but-zero come first. `::1` is the loopback, not an
  // IPv4-compatible address, but it fits the shape of one — twelve zero bytes then a non-zero
  // tail — so the mapped-address branch below would otherwise claim it and report it as
  // `0.0.0.1`. It stayed refused either way, which is why this went unnoticed; the reason it gave
  // was simply wrong, and a refusal that misnames the rule is a refusal nobody can act on.
  if (bytes.every((b) => b === 0)) {
    return deny('the unspecified address (::)');
  }
  if (bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1) {
    return deny('a loopback address (::1)');
  }

  // An IPv4-mapped or IPv4-compatible address is an IPv4 destination wearing an IPv6 spelling —
  // `::ffff:127.0.0.1` reaches the loopback interface just as `127.0.0.1` does. Re-check it under
  // the IPv4 rules rather than writing them a second time.
  const isV4Mapped =
    bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  const isV4Compatible =
    bytes.slice(0, 12).every((b) => b === 0) && !bytes.slice(12).every((b) => b === 0);
  if (isV4Mapped || isV4Compatible) {
    return checkIpv4(bytes.slice(12).join('.'));
  }
  const [first, second] = bytes as unknown as [number, number];
  if ((first & 0xfe) === 0xfc) {
    return deny('a unique-local address (fc00::/7)');
  }
  if (first === 0xfe && (second & 0xc0) === 0x80) {
    return deny('a link-local address (fe80::/10)');
  }
  if (first === 0xff) {
    return deny('a multicast address (ff00::/8)');
  }
  return ALLOWED;
}

/**
 * Whether the API may open a connection to this literal IP address.
 *
 * Anything that is not a well-formed address is refused: a value that reached here without being
 * either a name or an address is not something to guess about.
 */
export function checkAddress(address: string): AddressVerdict {
  const family = isIP(address);
  if (family === 4) {
    return checkIpv4(address);
  }
  if (family === 6) {
    return checkIpv6(address);
  }
  return deny('not a valid IP address');
}
