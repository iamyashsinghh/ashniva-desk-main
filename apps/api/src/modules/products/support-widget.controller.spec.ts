import { scopeKey } from './support-widget.controller';

/**
 * The widget's idempotency key is stored under `UNIQUE (product_id, idempotency_key)`, and the
 * whole key is chosen by a browser. Scoping it to the session's end user is what stops one of a
 * product's users being handed another's ticket id as a duplicate — so the scoping has to be a
 * function no two (user, key) pairs can share, not just a string with the user's name in it.
 */
describe('scopeKey', () => {
  it('keeps a key inside the namespace of the person the session was minted for', () => {
    expect(scopeKey('carelix-user-42', 'attempt-1')).not.toBe(
      scopeKey('carelix-user-43', 'attempt-1'),
    );
  });

  it('cannot be forged by putting the delimiter in the external user id', () => {
    // Identifiers with a colon are ordinary — `auth0:1234`, `acme:tickets`. Joined with a bare
    // colon these two collide, and the second caller receives the first's ticket.
    expect(scopeKey('acme', 'tickets:7')).not.toBe(scopeKey('acme:tickets', '7'));
  });

  it('maps distinct pairs to distinct keys wherever the split could be ambiguous', () => {
    const pairs: Array<[string, string]> = [
      ['a', 'b:c'],
      ['a:b', 'c'],
      ['a:b:c', ''],
      ['', 'a:b:c'],
      ['auth0:1234', '5'],
      ['auth0', '1234:5'],
      ['11:x', 'y'],
      ['1', '1:x:y'],
    ];
    const keys = pairs
      .filter(([, key]) => key !== '')
      .map(([user, key]) => scopeKey(user, key) ?? '');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is the same key for the same person retrying, which is the whole point', () => {
    expect(scopeKey('carelix-user-42', 'attempt-1')).toBe(scopeKey('carelix-user-42', 'attempt-1'));
  });

  it('scopes nothing when the browser sent no key: a missing key is not an empty one', () => {
    expect(scopeKey('carelix-user-42', undefined)).toBeUndefined();
  });
});
