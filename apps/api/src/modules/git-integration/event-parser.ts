import { parseTaskReferences, type TaskReference } from './task-references';

/**
 * Turns a GitHub or GitLab webhook payload into the same normalised shape, so everything
 * downstream — storage, task linking, the activity feed, release notes — is written once against
 * one vocabulary rather than twice against two providers.
 *
 * Payloads are treated as untrusted, arbitrarily-shaped JSON. Every field is read through a small
 * accessor that returns undefined rather than throwing, because a provider adding, renaming or
 * nesting a field must degrade to "we learned less from this event", never to a 500 on a webhook.
 */

export type CodeActivityKind =
  'COMMIT' | 'BRANCH_PUSH' | 'PULL_REQUEST' | 'REVIEW' | 'MERGE' | 'RELEASE' | 'TAG';

export interface ParsedCodeActivity {
  kind: CodeActivityKind;
  externalId: string;
  title: string;
  authorName?: string;
  authorExternalId?: string;
  url?: string;
  branch?: string;
  state?: string;
  occurredAt: Date;
  /** References found in the message, branch name or title. */
  references: TaskReference[];
}

// -----------------------------------------------------------------------------------------
// Safe readers for untrusted JSON
// -----------------------------------------------------------------------------------------

type Json = Record<string, unknown>;

function obj(value: unknown): Json | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : undefined;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return undefined;
}

/** Reads a nested path, e.g. path(body, 'pull_request', 'user', 'login'). */
function path(root: unknown, ...keys: string[]): unknown {
  let current: unknown = root;
  for (const key of keys) {
    const asObject = obj(current);
    if (!asObject) {
      return undefined;
    }
    current = asObject[key];
  }
  return current;
}

function when(value: unknown, fallback = new Date()): Date {
  const text = str(value);
  if (!text) {
    return fallback;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

/** `refs/heads/feature/x` → `feature/x`; `refs/tags/v1` → `v1`. */
function shortRef(ref: string | undefined): string | undefined {
  if (!ref) {
    return undefined;
  }
  return ref.replace(/^refs\/(heads|tags)\//, '');
}

/** Commit messages can be long; only the first line is a title. */
function firstLine(text: string | undefined, fallback: string): string {
  const line = text?.split('\n')[0]?.trim();
  return line && line.length > 0 ? line.slice(0, 300) : fallback;
}

// -----------------------------------------------------------------------------------------
// GitHub
// -----------------------------------------------------------------------------------------

export function parseGithubEvent(eventType: string, body: unknown): ParsedCodeActivity[] {
  switch (eventType) {
    case 'push':
      return githubPush(body);
    case 'pull_request':
      return githubPullRequest(body);
    case 'pull_request_review':
      return githubReview(body);
    case 'release':
      return githubRelease(body);
    default:
      // Unknown event types are recorded as received and simply produce no activity.
      return [];
  }
}

function githubPush(body: unknown): ParsedCodeActivity[] {
  const branch = shortRef(str(path(body, 'ref')));
  const out: ParsedCodeActivity[] = [];

  for (const entry of arr(path(body, 'commits'))) {
    const sha = str(path(entry, 'id'));
    if (!sha) {
      continue;
    }
    const message = str(path(entry, 'message'));
    out.push({
      kind: 'COMMIT',
      externalId: sha,
      title: firstLine(message, sha.slice(0, 7)),
      authorName: str(path(entry, 'author', 'name')),
      authorExternalId: str(path(entry, 'author', 'username')),
      url: str(path(entry, 'url')),
      branch,
      occurredAt: when(path(entry, 'timestamp')),
      references: parseTaskReferences(message, branch),
    });
  }

  // A branch created with no commits in the payload is still worth recording.
  if (out.length === 0 && branch) {
    out.push({
      kind: 'BRANCH_PUSH',
      externalId: `${branch}@${str(path(body, 'after')) ?? 'unknown'}`,
      title: `Pushed ${branch}`,
      authorName: str(path(body, 'pusher', 'name')),
      branch,
      occurredAt: new Date(),
      references: parseTaskReferences(branch),
    });
  }

  return out;
}

function githubPullRequest(body: unknown): ParsedCodeActivity[] {
  const number = str(path(body, 'pull_request', 'number')) ?? str(path(body, 'number'));
  if (!number) {
    return [];
  }
  const title = str(path(body, 'pull_request', 'title')) ?? `Pull request #${number}`;
  const branch = str(path(body, 'pull_request', 'head', 'ref'));
  const merged = path(body, 'pull_request', 'merged') === true;
  const action = str(path(body, 'action'));

  return [
    {
      // A merge is a distinct thing from the pull request itself: release notes care about what
      // actually landed, not about every state change along the way.
      kind: merged && action === 'closed' ? 'MERGE' : 'PULL_REQUEST',
      externalId: number,
      title,
      authorName: str(path(body, 'pull_request', 'user', 'login')),
      authorExternalId: str(path(body, 'pull_request', 'user', 'id')),
      url: str(path(body, 'pull_request', 'html_url')),
      branch,
      state: merged ? 'merged' : (str(path(body, 'pull_request', 'state')) ?? action),
      occurredAt: when(
        path(body, 'pull_request', 'merged_at') ?? path(body, 'pull_request', 'updated_at'),
      ),
      references: parseTaskReferences(title, branch, str(path(body, 'pull_request', 'body'))),
    },
  ];
}

function githubReview(body: unknown): ParsedCodeActivity[] {
  const reviewId = str(path(body, 'review', 'id'));
  const number = str(path(body, 'pull_request', 'number'));
  if (!reviewId || !number) {
    return [];
  }
  const title = str(path(body, 'pull_request', 'title')) ?? `Pull request #${number}`;
  return [
    {
      kind: 'REVIEW',
      externalId: reviewId,
      title: `Review on #${number}: ${title}`,
      authorName: str(path(body, 'review', 'user', 'login')),
      url: str(path(body, 'review', 'html_url')),
      state: str(path(body, 'review', 'state')),
      occurredAt: when(path(body, 'review', 'submitted_at')),
      references: parseTaskReferences(title),
    },
  ];
}

function githubRelease(body: unknown): ParsedCodeActivity[] {
  const tag = str(path(body, 'release', 'tag_name'));
  if (!tag) {
    return [];
  }
  return [
    {
      kind: 'RELEASE',
      externalId: tag,
      title: str(path(body, 'release', 'name')) ?? tag,
      authorName: str(path(body, 'release', 'author', 'login')),
      url: str(path(body, 'release', 'html_url')),
      state: path(body, 'release', 'draft') === true ? 'draft' : 'published',
      occurredAt: when(path(body, 'release', 'published_at')),
      references: parseTaskReferences(str(path(body, 'release', 'body'))),
    },
  ];
}

// -----------------------------------------------------------------------------------------
// GitLab
// -----------------------------------------------------------------------------------------

export function parseGitlabEvent(eventType: string, body: unknown): ParsedCodeActivity[] {
  // GitLab identifies the event in X-Gitlab-Event ("Push Hook") and again in object_kind ("push").
  const kind = str(path(body, 'object_kind')) ?? eventType.toLowerCase().replace(/\s+hook$/, '');
  switch (kind) {
    case 'push':
      return gitlabPush(body);
    case 'tag_push':
      return gitlabTagPush(body);
    case 'merge_request':
      return gitlabMergeRequest(body);
    case 'note':
      return [];
    default:
      return [];
  }
}

function gitlabPush(body: unknown): ParsedCodeActivity[] {
  const branch = shortRef(str(path(body, 'ref')));
  const out: ParsedCodeActivity[] = [];

  for (const entry of arr(path(body, 'commits'))) {
    const sha = str(path(entry, 'id'));
    if (!sha) {
      continue;
    }
    const message = str(path(entry, 'message'));
    out.push({
      kind: 'COMMIT',
      externalId: sha,
      title: firstLine(message, sha.slice(0, 7)),
      authorName: str(path(entry, 'author', 'name')),
      url: str(path(entry, 'url')),
      branch,
      occurredAt: when(path(entry, 'timestamp')),
      references: parseTaskReferences(message, branch),
    });
  }

  if (out.length === 0 && branch) {
    out.push({
      kind: 'BRANCH_PUSH',
      externalId: `${branch}@${str(path(body, 'after')) ?? 'unknown'}`,
      title: `Pushed ${branch}`,
      authorName: str(path(body, 'user_name')),
      branch,
      occurredAt: new Date(),
      references: parseTaskReferences(branch),
    });
  }

  return out;
}

function gitlabTagPush(body: unknown): ParsedCodeActivity[] {
  const tag = shortRef(str(path(body, 'ref')));
  if (!tag) {
    return [];
  }
  return [
    {
      kind: 'TAG',
      externalId: tag,
      title: `Tag ${tag}`,
      authorName: str(path(body, 'user_name')),
      occurredAt: new Date(),
      references: parseTaskReferences(tag),
    },
  ];
}

function gitlabMergeRequest(body: unknown): ParsedCodeActivity[] {
  const iid = str(path(body, 'object_attributes', 'iid'));
  if (!iid) {
    return [];
  }
  const title = str(path(body, 'object_attributes', 'title')) ?? `Merge request !${iid}`;
  const branch = str(path(body, 'object_attributes', 'source_branch'));
  const state = str(path(body, 'object_attributes', 'state'));
  const merged = state === 'merged';

  return [
    {
      kind: merged ? 'MERGE' : 'PULL_REQUEST',
      externalId: iid,
      title,
      authorName: str(path(body, 'user', 'name')),
      authorExternalId: str(path(body, 'user', 'id')),
      url: str(path(body, 'object_attributes', 'url')),
      branch,
      state,
      occurredAt: when(path(body, 'object_attributes', 'updated_at')),
      references: parseTaskReferences(
        title,
        branch,
        str(path(body, 'object_attributes', 'description')),
      ),
    },
  ];
}
