import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { Injectable } from '@nestjs/common';

import { checkAddress, isForbiddenHostname } from './address-rules';

/**
 * Where a destination is decided, for every protocol.
 *
 * `address-rules.ts` says which *addresses* are out of bounds. This says how a *name* becomes an
 * approved address without leaving a gap between the checking and the connecting. The two steps
 * are separate on purpose: the rules are pure and exhaustively tested, and this is the part that
 * has to talk to a resolver.
 *
 * Both outbound protocols use it — `SafeHttpService` for the five HTTP integrations, and the SMTP
 * transport for a tenant's mail server. A second copy of this loop is the thing most likely to
 * drift out of agreement with the first, and a drifted copy of a security check is worse than no
 * copy at all, because it looks like it is protecting something.
 */

/** Raised when a destination is refused, before any socket is opened. */
export class BlockedDestinationError extends Error {
  constructor(
    readonly host: string,
    readonly detail: string,
  ) {
    super(`Refused to connect to ${host}: it resolves to ${detail}`);
    this.name = 'BlockedDestinationError';
  }
}

/** An approved address, plus the name it came from. */
export interface PinnedAddress {
  /** The literal address the socket must be opened to. */
  address: string;
  family: 4 | 6;
  /** The original hostname, kept for TLS server-name verification and virtual hosting. */
  hostname: string;
  /** True when the host was exempted by an allow-list rather than judged on its address. */
  allowListed: boolean;
}

@Injectable()
export class SafeDestinationService {
  /**
   * Resolves a hostname and approves it, or refuses.
   *
   * **Why every answer is checked, not just the one used.** A name that resolves to both a public
   * and a private address is a rebinding attempt wearing a disguise. Checking only the address
   * that happens to be connected to would make the verdict depend on resolver ordering, which the
   * attacker influences and we do not.
   *
   * **Why the address is returned rather than the name.** Approving a name and then handing the
   * *name* to a socket library leaves the resolver free to answer differently the second time —
   * the check and the connection would be looking at two different machines. The caller connects
   * to the address this returns, so there is no second resolution to poison.
   *
   * @param allowedHosts hostnames exempt from the address rules; see `pinAllowListed`.
   */
  async resolve(hostname: string, allowedHosts: readonly string[] = []): Promise<PinnedAddress> {
    const host = stripBrackets(hostname).toLowerCase().replace(/\.$/, '');
    if (!host) {
      throw new BlockedDestinationError('the configured host', 'an empty hostname');
    }

    if (allowedHosts.includes(host)) {
      return this.pinAllowListed(host);
    }

    // Refused before DNS is consulted, so a resolver cannot be made part of the attack.
    if (isForbiddenHostname(host)) {
      throw new BlockedDestinationError(host, 'a private or loopback name');
    }

    // A literal address skips DNS but not the rules.
    const literal = isIP(host);
    if (literal) {
      const verdict = checkAddress(host);
      if (!verdict.allowed) {
        throw new BlockedDestinationError(host, verdict.reason);
      }
      return { address: host, family: literal as 4 | 6, hostname: host, allowListed: false };
    }

    const answers = await this.lookup(host);
    for (const entry of answers) {
      const verdict = checkAddress(entry.address);
      if (!verdict.allowed) {
        throw new BlockedDestinationError(host, verdict.reason);
      }
    }

    return { ...pick(answers), hostname: host, allowListed: false };
  }

  /**
   * An allow-listed host still has to resolve, but its address is not judged.
   *
   * The documented escape hatch for a deployment whose mail relay or self-hosted GitLab genuinely
   * lives on a private network. It is opt-in per host and per protocol, so it widens the rule for
   * the machines an operator named and for nothing else. The address is still pinned, so an
   * allow-listed name cannot be used to reach a *different* private host on a later resolution.
   */
  private async pinAllowListed(host: string): Promise<PinnedAddress> {
    const literal = isIP(host);
    if (literal) {
      return { address: host, family: literal as 4 | 6, hostname: host, allowListed: true };
    }
    const answers = await this.lookup(host);
    return { ...pick(answers), hostname: host, allowListed: true };
  }

  private async lookup(host: string): Promise<{ address: string; family: number }[]> {
    let answers: { address: string; family: number }[];
    try {
      answers = await dnsLookup(host, { all: true });
    } catch {
      throw new BlockedDestinationError(host, 'a name that does not resolve');
    }
    if (answers.length === 0) {
      throw new BlockedDestinationError(host, 'a name that resolves to nothing');
    }
    return answers;
  }
}

export function stripBrackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

/**
 * Which of a name's addresses to connect to, IPv4 first.
 *
 * Pinning costs the Happy Eyeballs that a socket library does for free: it races both families and
 * keeps whichever answers, whereas this opens one socket to one address. Taking whatever the
 * resolver listed first would turn a host that publishes an AAAA record into a hard failure on any
 * deployment without working IPv6. IPv4 is routable nearly everywhere, so it is the one to prefer.
 *
 * Safe to choose freely: every address here has already been through `checkAddress`, so preferring
 * one is a routing decision and not a security one.
 */
function pick(addresses: readonly { address: string; family: number }[]): {
  address: string;
  family: 4 | 6;
} {
  const chosen = addresses.find((entry) => entry.family === 4) ?? addresses[0];
  if (!chosen) {
    throw new Error('No address to connect to');
  }
  return { address: chosen.address, family: chosen.family === 6 ? 6 : 4 };
}
