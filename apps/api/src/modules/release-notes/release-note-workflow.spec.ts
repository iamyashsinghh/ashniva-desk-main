import { PERMISSIONS, type PermissionKey } from '@ashniva/types';

import { checkReleaseNoteAction, isEditable, isRegenerable } from './release-note-workflow';

const WRITER: PermissionKey[] = [PERMISSIONS.RELEASE_NOTE_WRITE];
const APPROVER: PermissionKey[] = [PERMISSIONS.RELEASE_NOTE_APPROVE];
const PUBLISHER: PermissionKey[] = [PERMISSIONS.RELEASE_NOTE_PUBLISH];
const ALL: PermissionKey[] = [...WRITER, ...APPROVER, ...PUBLISHER];

describe('the happy path', () => {
  it('walks draft → in review → approved → published', () => {
    expect(checkReleaseNoteAction('submit', 'DRAFT', ALL)).toEqual({ ok: true, to: 'IN_REVIEW' });
    expect(checkReleaseNoteAction('approve', 'IN_REVIEW', ALL)).toEqual({
      ok: true,
      to: 'APPROVED',
    });
    expect(checkReleaseNoteAction('publish', 'APPROVED', ALL)).toEqual({
      ok: true,
      to: 'PUBLISHED',
    });
  });

  it('allows changes requested and a return to draft', () => {
    expect(
      checkReleaseNoteAction('requestChanges', 'IN_REVIEW', ALL, 'Tighten the wording'),
    ).toEqual({ ok: true, to: 'CHANGES_REQUESTED' });
    expect(checkReleaseNoteAction('submit', 'CHANGES_REQUESTED', ALL)).toEqual({
      ok: true,
      to: 'IN_REVIEW',
    });
    expect(checkReleaseNoteAction('returnToDraft', 'CHANGES_REQUESTED', ALL)).toEqual({
      ok: true,
      to: 'DRAFT',
    });
  });
});

describe('states that must be refused', () => {
  it('will not publish a note nobody reviewed', () => {
    // The important one: holding the publish permission must not let someone skip review by
    // calling the endpoint directly.
    const result = checkReleaseNoteAction('publish', 'DRAFT', ALL);
    expect(result).toMatchObject({ ok: false, reason: 'state' });
  });

  it('will not publish a note that was sent back', () => {
    expect(checkReleaseNoteAction('publish', 'CHANGES_REQUESTED', ALL)).toMatchObject({
      ok: false,
      reason: 'state',
    });
  });

  it('treats a published note as final', () => {
    for (const action of ['submit', 'approve', 'publish', 'cancel', 'returnToDraft'] as const) {
      expect(checkReleaseNoteAction(action, 'PUBLISHED', ALL)).toMatchObject({ ok: false });
    }
  });

  it('will not approve straight from draft', () => {
    expect(checkReleaseNoteAction('approve', 'DRAFT', ALL)).toMatchObject({
      ok: false,
      reason: 'state',
    });
  });
});

describe('permissions', () => {
  it('lets a writer submit but not approve or publish', () => {
    expect(checkReleaseNoteAction('submit', 'DRAFT', WRITER)).toMatchObject({ ok: true });
    expect(checkReleaseNoteAction('approve', 'IN_REVIEW', WRITER)).toMatchObject({
      ok: false,
      reason: 'permission',
    });
    expect(checkReleaseNoteAction('publish', 'APPROVED', WRITER)).toMatchObject({
      ok: false,
      reason: 'permission',
    });
  });

  it('lets an approver approve but not publish', () => {
    // Approving and publishing are separate permissions precisely because publishing is the step
    // that shows the document to a client.
    expect(checkReleaseNoteAction('approve', 'IN_REVIEW', APPROVER)).toMatchObject({ ok: true });
    expect(checkReleaseNoteAction('publish', 'APPROVED', APPROVER)).toMatchObject({
      ok: false,
      reason: 'permission',
    });
  });

  it('refuses someone with no release-note permissions at all', () => {
    expect(checkReleaseNoteAction('submit', 'DRAFT', [])).toMatchObject({
      ok: false,
      reason: 'permission',
    });
  });

  it('checks the state before the permission, so the message names the real blocker', () => {
    expect(checkReleaseNoteAction('publish', 'DRAFT', [])).toMatchObject({ reason: 'state' });
  });
});

describe('actions that need a reason', () => {
  it('requires a note when sending work back', () => {
    expect(checkReleaseNoteAction('requestChanges', 'IN_REVIEW', ALL)).toMatchObject({
      ok: false,
      reason: 'note',
    });
    expect(checkReleaseNoteAction('requestChanges', 'IN_REVIEW', ALL, '   ')).toMatchObject({
      ok: false,
      reason: 'note',
    });
  });

  it('requires a note when cancelling', () => {
    expect(checkReleaseNoteAction('cancel', 'DRAFT', ALL)).toMatchObject({
      ok: false,
      reason: 'note',
    });
    expect(checkReleaseNoteAction('cancel', 'DRAFT', ALL, 'Superseded')).toMatchObject({
      ok: true,
    });
  });

  it('does not demand a reason for the ordinary steps', () => {
    expect(checkReleaseNoteAction('submit', 'DRAFT', ALL)).toMatchObject({ ok: true });
    expect(checkReleaseNoteAction('approve', 'IN_REVIEW', ALL)).toMatchObject({ ok: true });
  });
});

describe('editability', () => {
  it('allows editing only while the note is being written', () => {
    expect(isEditable('DRAFT')).toBe(true);
    expect(isEditable('CHANGES_REQUESTED')).toBe(true);
    expect(isEditable('IN_REVIEW')).toBe(false);
    expect(isEditable('APPROVED')).toBe(false);
  });

  it('freezes a published note, so what a client read cannot change silently', () => {
    expect(isEditable('PUBLISHED')).toBe(false);
    expect(isRegenerable('PUBLISHED')).toBe(false);
  });
});
