import { ApiError } from '../../shared/api/client';
import {
  isUnreachableMentionRefusal,
  mentionRefusalMessage,
  withMentionsAsPlainText,
} from './mention-refusal';

/**
 * Recognising the one refusal that has a way out of it, and taking it.
 *
 * The negative cases carry the weight. This screen used to treat *any* 400 on a body containing a
 * mention as a refused mention, which meant an over-long body or a bad attachment id was answered
 * with "that person can no longer be mentioned here" and a button that could not have helped.
 */

const PRIYA = '11111111-1111-4111-8111-111111111111';
const SAM = 'a1b2c3d4-e5f6-4708-9a0b-1c2d3e4f5061';
const NAMES = new Map([
  [PRIYA, 'Priya S'],
  [SAM, 'Sam T'],
]);

function apiError(status: number, message: string): ApiError {
  return new ApiError(status, { message }, 'Request failed');
}

const REFUSAL = 'You cannot mention somebody who is not in this conversation';

describe('isUnreachableMentionRefusal', () => {
  it('recognises the refusal the audience check answers with', () => {
    expect(isUnreachableMentionRefusal(apiError(400, REFUSAL), `@[${PRIYA}] hello`)).toBe(true);
  });

  // The defect this test exists for: every one of these is a 400 on a body naming somebody, and
  // none of them is fixed by sending the same words without the mention.
  it('does not claim a 400 about something else is about a mention', () => {
    const body = `@[${PRIYA}] hello`;
    expect(isUnreachableMentionRefusal(apiError(400, 'That attachment does not exist'), body)).toBe(
      false,
    );
    expect(
      isUnreachableMentionRefusal(
        apiError(400, 'body must be shorter than or equal to 4000 characters'),
        body,
      ),
    ).toBe(false);
    expect(
      isUnreachableMentionRefusal(
        apiError(400, 'clientMessageId must be shorter than or equal to 64 characters'),
        body,
      ),
    ).toBe(false);
  });

  // Otherwise a composer would offer to strip mentions from a message that has none, which reads
  // as the product having lost track of what the person wrote.
  it('does not fire on a body that names nobody, whatever the server said', () => {
    expect(isUnreachableMentionRefusal(apiError(400, REFUSAL), 'no mention here')).toBe(false);
  });

  it('is not fooled by a different status or by a plain error', () => {
    expect(isUnreachableMentionRefusal(apiError(403, REFUSAL), `@[${PRIYA}] hi`)).toBe(false);
    expect(isUnreachableMentionRefusal(new Error(REFUSAL), `@[${PRIYA}] hi`)).toBe(false);
  });
});

describe('withMentionsAsPlainText', () => {
  // This used to delete the token. It now writes the name, as the web app does: the sentence keeps
  // its addressee and nothing anybody typed is silently removed.
  it('writes the token out as the name it was displaying', () => {
    expect(withMentionsAsPlainText(`ready @[${PRIYA}] for review`, NAMES)).toBe(
      'ready @Priya S for review',
    );
  });

  it('rewrites every mention in the line, not only the first', () => {
    expect(withMentionsAsPlainText(`@[${PRIYA}] and @[${SAM}] — ready?`, NAMES)).toBe(
      '@Priya S and @Sam T — ready?',
    );
  });

  // A raw uuid left in front of the reader would look like a leaked identifier.
  it('degrades a forgotten name to “someone” rather than showing an id', () => {
    expect(withMentionsAsPlainText(`@[${PRIYA}] hi`, new Map())).toBe('@someone hi');
  });

  it('leaves a body with no mentions exactly as it was', () => {
    expect(withMentionsAsPlainText('ready for review', NAMES)).toBe('ready for review');
  });
});

describe('mentionRefusalMessage', () => {
  it('names the person when there is only one of them to name', () => {
    expect(mentionRefusalMessage(`@[${PRIYA}] hi`, NAMES)).toContain('Priya S can no longer be');
  });

  // The API reports that something in the body was unreachable without saying which id, so naming
  // one of two would be a guess presented as a fact.
  it('stays vague when several were named, because the server did not say which failed', () => {
    const message = mentionRefusalMessage(`@[${PRIYA}] @[${SAM}] hi`, NAMES);
    expect(message).toContain('Somebody you named');
    expect(message).not.toContain('Priya S');
  });

  it('always says the message is still there', () => {
    expect(mentionRefusalMessage(`@[${PRIYA}] hi`, NAMES)).toContain('still below');
  });
});
