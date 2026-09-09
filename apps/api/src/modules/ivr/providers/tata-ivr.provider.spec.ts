import { NotImplementedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';

import { UNCONFIGURED_IVR_ACCOUNT, type IvrProviderAccount } from '../ivr-provider.interface';
import { TataIvrProvider } from './tata-ivr.provider';

/**
 * The Tata adapter's readiness report.
 *
 * The point of these tests is not that the adapter refuses — that part is one line. It is that the
 * refusal is *actionable*: the report has to keep naming the vendor's half item by item, because
 * the only way this integration ever finishes is somebody reading that list and going to ask for
 * exactly those things. A report that quietly lost an entry would look like progress.
 */
describe('TataIvrProvider — readiness', () => {
  const provider = new TataIvrProvider();
  const account: IvrProviderAccount = {
    externalAccountId: 'acct-1',
    credential: 'secret',
    baseUrl: 'https://api.example.invalid',
  };

  it('is never healthy, because it cannot dial', async () => {
    await expect(provider.readiness(account)).resolves.toMatchObject({ healthy: false });
  });

  it('names every part of the vendor contract that is still missing', async () => {
    const { missing } = await provider.readiness(account);
    const keys = missing.map((entry) => entry.key);

    // Each of these is a separate conversation with the vendor. Collapsing any two of them into
    // one entry is how a requirement gets forgotten.
    expect(keys).toEqual(
      expect.arrayContaining([
        'outbound-call-endpoint',
        'authentication',
        'directory-mapping',
        'transfer-and-hangup',
        'recording-retrieval',
        'webhook-contract',
        'operational-limits',
      ]),
    );
  });

  it('gives every requirement something concrete to ask for', async () => {
    const { missing } = await provider.readiness(account);
    for (const requirement of missing) {
      expect(requirement.what.length).toBeGreaterThan(20);
      expect(requirement.needs.length).toBeGreaterThan(0);
      for (const need of requirement.needs) {
        expect(need.trim()).not.toBe('');
      }
    }
  });

  it('keeps the directory mapping on the list, which is the one nobody thinks of', async () => {
    // Desk sends a Desk user id and a masked reference and transmits no telephone number. Somebody
    // has to hold the directory that turns those into numbers, and no vendor mechanism for it is
    // documented. Without this, complete API documentation for everything else is still not enough.
    const { missing } = await provider.readiness(account);
    const directory = missing.find((entry) => entry.key === 'directory-mapping');
    expect(directory?.needs.join(' ')).toContain('agentUserId');
    expect(directory?.needs.join(' ')).toContain('clientPhoneRef');
  });

  it('reports a missing connection ahead of the vendor requirements', async () => {
    const { missing } = await provider.readiness(null);
    expect(missing[0]?.key).toBe('connection');
  });

  it('says whose connection is missing, since the check is per tenant', async () => {
    // The endpoint resolves the account from the caller's own organization, so an installation-wide
    // sentence would tell an unconfigured tenant that the platform is broken when their neighbour's
    // calls are working fine.
    const { missing } = await provider.readiness(null);
    expect(missing[0]?.what).toContain('Your organization');
  });

  it('reports a missing base URL when the connection has one but no host', async () => {
    const { missing } = await provider.readiness({ ...account, baseUrl: null });
    expect(missing[0]?.key).toBe('base-url');
  });

  it('says what happens to a call placed meanwhile, because the failure is quiet', async () => {
    const { behaviourWhenUnready } = await provider.readiness(account);
    expect(behaviourWhenUnready).toContain('support queue');
    expect(behaviourWhenUnready).toContain('No telephone rings');
  });

  it('lists what already works, so nobody rebuilds it', async () => {
    const { ready } = await provider.readiness(account);
    expect(ready.join(' ')).toContain('signature verification');
    expect(ready.join(' ')).toContain('de-duplication');
  });
});

describe('TataIvrProvider — the half that is real', () => {
  const provider = new TataIvrProvider();
  const secret = 'webhook-secret';
  const body = Buffer.from('{"accountId":"acct-1","type":"call.ended","callId":"c1"}');
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  it('accepts a correctly signed delivery', () => {
    const result = provider.verifyWebhook(body, { 'x-ivr-signature': signature }, secret);
    expect(result.valid).toBe(true);
  });

  it('refuses one signed with the wrong secret', () => {
    const result = provider.verifyWebhook(body, { 'x-ivr-signature': signature }, 'other-secret');
    expect(result).toEqual({ valid: false, deliveryId: undefined });
  });

  it('falls back to the body digest when no delivery id is sent', () => {
    // A genuine redelivery is byte-identical, so its digest collides exactly as a repeated id
    // would — which is what makes the idempotency hold even for a provider that sends no header.
    const first = provider.verifyWebhook(body, { 'x-ivr-signature': signature }, secret);
    const second = provider.verifyWebhook(body, { 'x-ivr-signature': signature }, secret);
    expect(first.deliveryId).toBe(second.deliveryId);
    expect(first.deliveryId?.startsWith('digest:')).toBe(true);
  });

  it('prefers the provider’s own delivery id when there is one', () => {
    const result = provider.verifyWebhook(
      body,
      { 'x-ivr-signature': signature, 'x-ivr-delivery': 'delivery-9' },
      secret,
    );
    expect(result.deliveryId).toBe('delivery-9');
  });

  it('refuses to dial rather than guessing at an endpoint', async () => {
    await expect(
      provider.startOutboundCall({
        organizationId: 'org',
        ticketId: 'ticket',
        agentUserId: 'agent',
        clientPhoneRef: 'ref',
        recordingConsent: false,
        account: { externalAccountId: 'a', credential: 'c', baseUrl: 'https://x.invalid' },
      }),
    ).rejects.toBeInstanceOf(NotImplementedException);
  });
});

describe('UNCONFIGURED_IVR_ACCOUNT', () => {
  it('cannot be mutated, because every tenant shares it', () => {
    // Four independent literals became one object when `baseUrl` was added. A later adapter
    // writing something that looks defensive would otherwise make the first unconfigured tenant's
    // value stick for everybody who reached the same path afterwards.
    expect(Object.isFrozen(UNCONFIGURED_IVR_ACCOUNT)).toBe(true);
    expect(() => {
      (UNCONFIGURED_IVR_ACCOUNT as { baseUrl: string | null }).baseUrl = 'https://leaked.invalid';
    }).toThrow(TypeError);
    expect(UNCONFIGURED_IVR_ACCOUNT.baseUrl).toBeNull();
  });
});
