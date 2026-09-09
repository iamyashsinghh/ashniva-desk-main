import { messageIdempotencyKey, testIdempotencyKey } from './idempotency';

const base = {
  template: 'TASK_ASSIGNED' as const,
  recipient: 'priya@example.com',
  entityType: 'task',
  entityId: 'task-1',
};

describe('messageIdempotencyKey', () => {
  it('is stable, so a retried job produces the same key and not a second email', () => {
    expect(messageIdempotencyKey(base)).toBe(messageIdempotencyKey({ ...base }));
  });

  it('ignores the case and padding of the address', () => {
    expect(messageIdempotencyKey({ ...base, recipient: '  Priya@Example.com ' })).toBe(
      messageIdempotencyKey(base),
    );
  });

  it('differs per recipient, so two people both get the message', () => {
    expect(messageIdempotencyKey({ ...base, recipient: 'sam@example.com' })).not.toBe(
      messageIdempotencyKey(base),
    );
  });

  it('differs per entity and per template', () => {
    expect(messageIdempotencyKey({ ...base, entityId: 'task-2' })).not.toBe(
      messageIdempotencyKey(base),
    );
    expect(messageIdempotencyKey({ ...base, template: 'REVIEW_REQUESTED' })).not.toBe(
      messageIdempotencyKey(base),
    );
  });

  it('lets a genuine repeat through when the caller names the occurrence', () => {
    // A second reply on the same ticket is a second message, not a duplicate.
    const first = messageIdempotencyKey({ ...base, occurrence: 'reply-1' });
    const second = messageIdempotencyKey({ ...base, occurrence: 'reply-2' });
    expect(first).not.toBe(second);
  });

  it('does not carry the address into the key it stores', () => {
    const key = messageIdempotencyKey(base);
    expect(key).not.toContain('priya');
    expect(key).not.toContain('example.com');
    expect(key).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('testIdempotencyKey', () => {
  it('changes every time, so an administrator can press the button twice', () => {
    const first = testIdempotencyKey('priya@example.com', new Date('2026-09-06T10:00:00Z'));
    const second = testIdempotencyKey('priya@example.com', new Date('2026-09-06T10:00:01Z'));
    expect(first).not.toBe(second);
  });
});
