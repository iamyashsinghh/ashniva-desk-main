import { useRef, useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { isUnreachableMentionRefusal, mentionRefusalMessage } from './mention-refusal';

export interface SendMessageDraft {
  body: string;
  attachmentIds: string[];
  /**
   * The caller's own id for this send, stable across retries.
   *
   * `POST /conversations/:id/messages` returns the first message rather than posting a second one
   * when it sees a `clientMessageId` it has already stored, so this is what makes a retry safe. A
   * key minted per *attempt* — which is what the screen used to do — would defeat it exactly when
   * it matters: the send whose response was lost on the way back.
   */
  clientMessageId: string;
}

/**
 * Why the last send did not land.
 *
 * `mention` is kept apart from everything else because it is the one failure with a way out of it
 * that is not "try the same thing again": the message is fine, the person named in it is not, and
 * the composer can offer to send it without them.
 */
export type ComposerFailure = { kind: 'mention' | 'other'; message: string };

/**
 * Sending, and what to do when it fails.
 *
 * **A failed send keeps its key.** The key is minted on the first attempt and released only once a
 * message has actually landed, so Retry re-sends *that* message rather than a second one — which is
 * the whole point, because the failure most worth retrying is the one where the request arrived and
 * the response did not.
 *
 * **A changed draft is a different message, so it gets a different key.** Holding the key across an
 * edit turned the safeguard into a way to lose what somebody wrote: the send lands but its response
 * is lost, the sender rewrites the wording, presses Send, and the server recognises the key and
 * answers with the *first* body — a 2xx, so the composer clears the box and the revision is gone
 * with nothing saying so. `draftChanged` is called wherever the draft changes, which is the rule
 * the mobile composer already follows.
 *
 * **The files count as the draft.** Attaching or removing one releases the key too, and for the
 * sharper version of the same failure: the first send landed and adopted nothing, the sender adds
 * the file they meant to include, presses Send, and the key returns the original message — without
 * the attachment, and with a 2xx that clears the strip.
 *
 * **Reusing the key across a mention refusal is safe, and deliberate.** The server checks the
 * audience before it writes the row, so a 400 from that check means nothing was stored under the
 * key; sending the rewritten body with the same key is one message being sent once, not two. That
 * one rewrite is the composer's own, not the sender's, so it does not count as a changed draft.
 */
export function useComposerSend(send: (draft: SendMessageDraft) => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ComposerFailure | null>(null);
  const pendingKey = useRef<string | null>(null);

  async function attempt(
    body: string,
    attachmentIds: string[],
    mentionNames: ReadonlyMap<string, string>,
  ): Promise<boolean> {
    pendingKey.current ??= crypto.randomUUID();
    setBusy(true);
    setFailure(null);
    try {
      await send({ body, attachmentIds, clientMessageId: pendingKey.current });
      pendingKey.current = null;
      return true;
    } catch (cause) {
      setFailure(
        isUnreachableMentionRefusal(cause, body)
          ? { kind: 'mention', message: mentionRefusalMessage(body, mentionNames) }
          : { kind: 'other', message: errorMessage(cause) },
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    failure,
    attempt,
    /** The sender changed the words. Whatever goes next is a new message, not a retry of the old. */
    draftChanged: () => {
      pendingKey.current = null;
    },
    clearFailure: () => setFailure(null),
  };
}
