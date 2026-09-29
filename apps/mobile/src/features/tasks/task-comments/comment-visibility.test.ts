import { VISIBILITY, type CommentSummary } from '@ashniva/types';

import { composerVisibility, filterComments } from './comment-visibility';

describe('composerVisibility', () => {
  it('gives somebody without internal notes no choice: what they write, the client reads', () => {
    expect(
      composerVisibility({ canInternal: false, hasClient: true, clientVisible: false }),
    ).toEqual({ visibility: VISIBILITY.CLIENT, canToggle: false });
  });

  it('lets staff choose on a task that has a client, internal by default', () => {
    expect(
      composerVisibility({ canInternal: true, hasClient: true, clientVisible: false }),
    ).toEqual({ visibility: VISIBILITY.INTERNAL, canToggle: true });
    expect(composerVisibility({ canInternal: true, hasClient: true, clientVisible: true })).toEqual(
      {
        visibility: VISIBILITY.CLIENT,
        canToggle: true,
      },
    );
  });

  it('keeps staff internal on a task with no client, whatever the switch last said', () => {
    expect(
      composerVisibility({ canInternal: true, hasClient: false, clientVisible: true }),
    ).toEqual({ visibility: VISIBILITY.INTERNAL, canToggle: false });
  });
});

describe('filterComments', () => {
  const comments = [
    { id: 'a', visibility: VISIBILITY.INTERNAL },
    { id: 'b', visibility: VISIBILITY.CLIENT },
  ] as unknown as CommentSummary[];

  it('narrows to one audience, or shows both', () => {
    expect(filterComments(comments, 'all').map((comment) => comment.id)).toEqual(['a', 'b']);
    expect(filterComments(comments, 'internal').map((comment) => comment.id)).toEqual(['a']);
    expect(filterComments(comments, 'client').map((comment) => comment.id)).toEqual(['b']);
  });
});
