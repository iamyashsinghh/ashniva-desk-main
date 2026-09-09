import { ApiError } from '../../../shared/lib/api-client';
import {
  isUnreachableMentionRefusal,
  mentionRefusalMessage,
  withMentionsAsPlainText,
} from './mention-refusal';

const PRIYA = '3f1d2f2e-7c1a-4a0b-9f6e-1b2c3d4e5f60';
const SAM = 'a1b2c3d4-e5f6-4708-9a0b-1c2d3e4f5061';
const NAMES = new Map([
  [PRIYA, 'Priya S'],
  [SAM, 'Sam T'],
]);

function apiError(status: number, message: string): ApiError {
  return new ApiError(
    status,
    { statusCode: status, error: 'Bad Request', message, timestamp: '2026-09-08T10:00:00.000Z' },
    'Bad Request',
  );
}

const REFUSAL = 'You cannot mention somebody who is not in this conversation';

describe('isUnreachableMentionRefusal', () => {
  it('recognises the refusal the audience check answers with', () => {
    expect(isUnreachableMentionRefusal(apiError(400, REFUSAL), `@[${PRIYA}] hello`)).toBe(true);
  });

  it('does not claim a 400 about something else is about a mention', () => {
    const other = apiError(400, 'That attachment does not exist');
    expect(isUnreachableMentionRefusal(other, `@[${PRIYA}] hello`)).toBe(false);
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
  it('writes the token out as the name it was displaying', () => {
    expect(withMentionsAsPlainText(`@[${PRIYA}] are we on?`, NAMES)).toBe('@Priya S are we on?');
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

  it('leaves a message with no mentions exactly as it was', () => {
    expect(withMentionsAsPlainText('nothing to rewrite', NAMES)).toBe('nothing to rewrite');
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

  it('always says the message was kept', () => {
    expect(mentionRefusalMessage(`@[${PRIYA}] hi`, NAMES)).toContain('kept');
  });
});
