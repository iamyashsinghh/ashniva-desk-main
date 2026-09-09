import { parseGithubEvent, parseGitlabEvent } from './event-parser';

describe('parseGithubEvent', () => {
  it('turns a push into one activity per commit, with references from message and branch', () => {
    const activities = parseGithubEvent('push', {
      ref: 'refs/heads/feature/ACM-14-checkout',
      commits: [
        {
          id: 'a'.repeat(40),
          message: 'TSK-7 fix the total\n\nlonger body text',
          url: 'https://github.test/c/aaa',
          timestamp: '2026-09-06T10:00:00Z',
          author: { name: 'Priya S', username: 'priya' },
        },
      ],
    });

    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      kind: 'COMMIT',
      externalId: 'a'.repeat(40),
      // Only the first line becomes the title.
      title: 'TSK-7 fix the total',
      authorName: 'Priya S',
      branch: 'feature/ACM-14-checkout',
    });
    expect(activities[0]?.references.map((r) => r.raw)).toEqual(['TSK-7', 'ACM-14']);
  });

  it('records a branch push that carries no commits', () => {
    const [activity] = parseGithubEvent('push', {
      ref: 'refs/heads/feature/TSK-9',
      commits: [],
      after: 'abc123',
      pusher: { name: 'Arjun M' },
    });
    expect(activity).toMatchObject({ kind: 'BRANCH_PUSH', branch: 'feature/TSK-9' });
    expect(activity?.references.map((r) => r.raw)).toEqual(['TSK-9']);
  });

  it('distinguishes a merged pull request from an open one', () => {
    const open = parseGithubEvent('pull_request', {
      action: 'opened',
      pull_request: { number: 12, title: 'TSK-3 add loyalty tiers', state: 'open', merged: false },
    });
    expect(open[0]).toMatchObject({ kind: 'PULL_REQUEST', state: 'open' });

    // Release notes care about what actually landed, so a merge is its own kind.
    const merged = parseGithubEvent('pull_request', {
      action: 'closed',
      pull_request: {
        number: 12,
        title: 'TSK-3 add loyalty tiers',
        merged: true,
        merged_at: '2026-09-06T11:00:00Z',
        head: { ref: 'feature/TSK-3' },
        user: { login: 'priya' },
      },
    });
    expect(merged[0]).toMatchObject({ kind: 'MERGE', state: 'merged', externalId: '12' });
    expect(merged[0]?.occurredAt.toISOString()).toBe('2026-09-06T11:00:00.000Z');
  });

  it('parses a review and a release', () => {
    const [review] = parseGithubEvent('pull_request_review', {
      review: { id: 555, state: 'approved', user: { login: 'sneha' } },
      pull_request: { number: 12, title: 'TSK-3 add loyalty tiers' },
    });
    expect(review).toMatchObject({ kind: 'REVIEW', externalId: '555', state: 'approved' });

    const [release] = parseGithubEvent('release', {
      release: { tag_name: 'v1.4.0', name: 'September release', draft: false },
    });
    expect(release).toMatchObject({ kind: 'RELEASE', externalId: 'v1.4.0', state: 'published' });
  });

  it('returns nothing for an event type it does not handle', () => {
    expect(parseGithubEvent('ping', { zen: 'hello' })).toEqual([]);
    expect(parseGithubEvent('star', {})).toEqual([]);
  });

  it('survives a malformed payload instead of throwing', () => {
    // A provider renaming or nesting a field must cost us information, never a 500 on a webhook.
    expect(() => parseGithubEvent('push', null)).not.toThrow();
    expect(() => parseGithubEvent('push', { ref: 42, commits: 'nope' })).not.toThrow();
    expect(() => parseGithubEvent('pull_request', { pull_request: [] })).not.toThrow();
    expect(parseGithubEvent('push', { commits: [{ no_id: true }] })).toEqual([]);
  });
});

describe('parseGitlabEvent', () => {
  it('parses a push using object_kind', () => {
    const [activity] = parseGitlabEvent('Push Hook', {
      object_kind: 'push',
      ref: 'refs/heads/TSK-21-fix',
      commits: [
        {
          id: 'b'.repeat(40),
          message: 'TSK-21 correct the tax split',
          timestamp: '2026-09-06T09:00:00Z',
          author: { name: 'Arjun M' },
        },
      ],
    });
    expect(activity).toMatchObject({ kind: 'COMMIT', branch: 'TSK-21-fix', authorName: 'Arjun M' });
    expect(activity?.references.map((r) => r.raw)).toEqual(['TSK-21']);
  });

  it('parses a tag push', () => {
    const [activity] = parseGitlabEvent('Tag Push Hook', {
      object_kind: 'tag_push',
      ref: 'refs/tags/v2.0.0',
      user_name: 'Rahul K',
    });
    expect(activity).toMatchObject({ kind: 'TAG', externalId: 'v2.0.0' });
  });

  it('maps a merged merge request to MERGE and an open one to PULL_REQUEST', () => {
    const open = parseGitlabEvent('Merge Request Hook', {
      object_kind: 'merge_request',
      object_attributes: { iid: 4, title: 'TSK-5 invoice totals', state: 'opened' },
    });
    expect(open[0]).toMatchObject({ kind: 'PULL_REQUEST', externalId: '4', state: 'opened' });

    const merged = parseGitlabEvent('Merge Request Hook', {
      object_kind: 'merge_request',
      object_attributes: {
        iid: 4,
        title: 'TSK-5 invoice totals',
        state: 'merged',
        source_branch: 'TSK-5',
        updated_at: '2026-09-06T12:00:00Z',
      },
    });
    expect(merged[0]).toMatchObject({ kind: 'MERGE', state: 'merged', branch: 'TSK-5' });
  });

  it('falls back to the header when object_kind is missing', () => {
    const activities = parseGitlabEvent('Push Hook', {
      ref: 'refs/heads/main',
      commits: [{ id: 'c'.repeat(40), message: 'chore' }],
    });
    expect(activities[0]).toMatchObject({ kind: 'COMMIT' });
  });

  it('ignores note events and unknown kinds', () => {
    expect(parseGitlabEvent('Note Hook', { object_kind: 'note' })).toEqual([]);
    expect(parseGitlabEvent('Pipeline Hook', { object_kind: 'pipeline' })).toEqual([]);
  });

  it('survives a malformed payload', () => {
    expect(() => parseGitlabEvent('Push Hook', undefined)).not.toThrow();
    expect(parseGitlabEvent('Merge Request Hook', { object_kind: 'merge_request' })).toEqual([]);
  });
});
