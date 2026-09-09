import type { MentionableUser } from '@ashniva/types';
import { useCallback, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { useMentionSearch } from './mention-search';

/**
 * What counts as the word being typed after an `@`.
 *
 * Anchored to a space or the start of the line so an email address does not open the picker in the
 * middle of somebody typing one, and letter-class rather than `\w` so a name outside ASCII narrows
 * the list like any other.
 */
const TRAILING_MENTION = /(?:^|\s)@([\p{L}\p{N}. '-]*)$/u;
/** The same word, for cutting it back out when a name is chosen. */
const MENTION_WORD = /@[\p{L}\p{N}. '-]*$/u;

/**
 * The composer's half of the mention picker: when it is open, what goes into the draft, and which
 * keys it takes before the textarea does.
 *
 * **The names are remembered as they are inserted.** A mention is written as `@[uuid]`, which is
 * what makes it survive a rename and what stops one being forged — but it also means the draft no
 * longer knows who it is addressing. That matters in exactly one place: when the server refuses a
 * mention, the composer has to be able to say *whose* mention it was and to rewrite it as a plain
 * name. The map is that memory, and it is why it lives beside the draft rather than inside the
 * search, whose results have moved on by then.
 */
export function useComposerMentions(
  conversationId: string | undefined,
  textarea: React.RefObject<HTMLTextAreaElement | null>,
) {
  const search = useMentionSearch(conversationId);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  // A ref as well as state: `handledByPicker` runs inside an event handler that must decide with
  // the current draft, and reading it back through state would be a render behind.
  const draft = useRef('');

  const noteDraft = useCallback((value: string) => {
    draft.current = value;
  }, []);

  /** Opens, narrows or closes the picker for what has just been typed. */
  function reactToDraft(value: string, caret: number): void {
    draft.current = value;
    const match = TRAILING_MENTION.exec(value.slice(0, caret));
    search.setTerm(match ? (match[1] ?? '') : null);
  }

  /** The draft with the half-typed name replaced by the chosen person's id. */
  function insert(person: MentionableUser, caret: number): string {
    const before = draft.current.slice(0, caret).replace(MENTION_WORD, '');
    const next = `${before}@[${person.userId}] ${draft.current.slice(caret)}`;
    setNames((current) => new Map(current).set(person.userId, person.name));
    draft.current = next;
    search.setTerm(null);
    textarea.current?.focus();
    return next;
  }

  /**
   * The keys the picker claims. Returns the draft to apply, or null when the composer should go on
   * handling the press itself.
   *
   * Enter is the interesting one: with somebody highlighted it chooses them rather than sending a
   * half-written line, which is what stops a mention becoming a message.
   */
  function handleKey(event: ReactKeyboardEvent): string | null | 'handled' {
    if (event.key === 'Escape') {
      search.setTerm(null);
      return 'handled';
    }
    if (!search.isOpen || search.people.length === 0) {
      return null;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      search.move(event.key === 'ArrowDown' ? 1 : -1);
      return 'handled';
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      const person = search.chosen();
      if (person) {
        return insert(person, textarea.current?.selectionStart ?? draft.current.length);
      }
    }
    return null;
  }

  return { search, names, noteDraft, reactToDraft, insert, handleKey };
}
