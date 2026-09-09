import { addressHint, recipientDigest, redactMessage } from './redact';

describe('redactMessage', () => {
  it('removes bearer tokens and key/value secrets', () => {
    expect(redactMessage('Authorization: Bearer abc123def456ghi789')).not.toContain('abc123');
    expect(redactMessage('failed with token=abc123def456')).not.toContain('abc123def456');
    expect(redactMessage('{"access_token": "s3cr3tvalue123"}')).not.toContain('s3cr3tvalue123');
    expect(redactMessage('password=hunter2')).not.toContain('hunter2');
  });

  it('removes provider token shapes even without a label', () => {
    // A provider error often embeds the token it rejected.
    expect(redactMessage('bad credentials for ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345')).not.toContain(
      'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345',
    );
    expect(redactMessage('glpat-abcdefghijklmnopqrst rejected')).not.toContain(
      'glpat-abcdefghijklmnopqrst',
    );
  });

  it('removes JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9P';
    expect(redactMessage(`token ${jwt} expired`)).not.toContain(jwt);
  });

  it('removes personal data, which is not a secret but equally unwanted in a log', () => {
    expect(redactMessage('could not deliver to priya@example.com')).not.toContain('example.com');
    expect(redactMessage('WhatsApp send failed for +91 98765 43210')).not.toContain('98765');
  });

  it('removes credentials embedded in a URL', () => {
    expect(redactMessage('connect https://user:s3cret@smtp.example.com failed')).not.toContain(
      's3cret',
    );
  });

  it('keeps the useful part of the message', () => {
    const out = redactMessage('SMTP 535 authentication failed for token=abc123');
    expect(out).toContain('535');
    expect(out).toContain('authentication failed');
  });

  it('accepts an Error, a string, or anything else without throwing', () => {
    expect(redactMessage(new Error('boom'))).toBe('boom');
    expect(redactMessage('plain')).toBe('plain');
    expect(redactMessage({ nested: 'value' })).toContain('value');
    expect(redactMessage(null)).toBe('');
    expect(redactMessage(undefined)).toBe('');
  });

  it('caps the length so a whole response body cannot land in a column', () => {
    expect(redactMessage('x'.repeat(5_000)).length).toBeLessThanOrEqual(501);
  });
});

describe('recipientDigest', () => {
  it('is stable for the same address in the same organization', () => {
    expect(recipientDigest('org-1', 'a@example.com')).toBe(
      recipientDigest('org-1', 'a@example.com'),
    );
  });

  it('ignores case and surrounding whitespace', () => {
    expect(recipientDigest('org-1', '  A@Example.COM ')).toBe(
      recipientDigest('org-1', 'a@example.com'),
    );
  });

  it('differs between tenants, so a shared contact is not revealed by a matching digest', () => {
    expect(recipientDigest('org-1', 'a@example.com')).not.toBe(
      recipientDigest('org-2', 'a@example.com'),
    );
  });

  it('does not contain the address', () => {
    expect(recipientDigest('org-1', 'priya@example.com')).not.toContain('priya');
  });
});

describe('addressHint', () => {
  it('shows only the last four characters', () => {
    expect(addressHint('+919876543210')).toBe('…3210');
  });

  it('reveals nothing for a very short value', () => {
    expect(addressHint('abc')).toBe('[redacted]');
  });
});
