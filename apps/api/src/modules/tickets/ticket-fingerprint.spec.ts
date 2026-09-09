import { errorCodeFromFingerprint, fingerprintTicket } from './ticket-fingerprint';

/**
 * The columns every ticket is matched on, and the one place they are computed.
 *
 * What matters here is the round trip: whatever `fingerprintTicket` puts into the fingerprint,
 * `errorCodeFromFingerprint` has to get back out again, because that is what the candidate query
 * ranks on instead of re-reading every description.
 */
describe('fingerprintTicket', () => {
  it('feeds the module into the keywords as well as the fingerprint', () => {
    const columns = fingerprintTicket({
      title: 'Invoice printing fails',
      description: 'Nothing comes out of the printer.',
      module: 'Billing',
      productId: 'p1',
      productVersion: '3.1.4',
    });
    expect(columns.keywords).toContain('billing');
    expect(columns.fingerprint).toBe('p1|billing|3.1.4|-');
  });

  it('lifts a quoted error code into the fingerprint', () => {
    const columns = fingerprintTicket({
      title: 'Scanner stops',
      description: 'The log says ERR_SCAN_TIMEOUT after about a minute.',
      module: null,
      productId: null,
      productVersion: null,
    });
    expect(columns.fingerprint).toBe('-|-|-|err_scan_timeout');
    expect(errorCodeFromFingerprint(columns.fingerprint)).toBe('ERR_SCAN_TIMEOUT');
  });

  it('gives a ticket with nothing to go on a fingerprint that still matches its own kind', () => {
    const columns = fingerprintTicket({
      title: 'It is slow',
      description: 'Everything is slow.',
      module: null,
      productId: null,
      productVersion: null,
    });
    // Not null: a fingerprint of four placeholders is a real bucket — every ticket that named
    // nothing — and it is the keyword score that decides whether two of them actually match.
    expect(columns.fingerprint).toBe('-|-|-|-');
  });
});

describe('errorCodeFromFingerprint', () => {
  it('reads nothing out of a fingerprint that quoted no code', () => {
    expect(errorCodeFromFingerprint('p1|billing|3.1.4|-')).toBeNull();
  });

  it('refuses anything that is not a fingerprint', () => {
    expect(errorCodeFromFingerprint(null)).toBeNull();
    expect(errorCodeFromFingerprint('')).toBeNull();
    // A row written before the column existed, or by hand. Four parts or nothing.
    expect(errorCodeFromFingerprint('billing|3.1.4')).toBeNull();
  });
});
