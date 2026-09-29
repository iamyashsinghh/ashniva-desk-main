import { encodeMentions, type MentionableUser } from '@ashniva/types';
import { useCallback, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

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
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

/** The picker's state the composer drives — conversation or task, same shape. */
export type MentionSearchControls = {
  term: string | null;
  isOpen: boolean;
  people: readonly MentionableUser[];
  isLoading: boolean;
  hasMore: boolean;
  activeIndex: number;
  setTerm: (term: string | null) => void;
  move: (delta: number) => void;
  chosen: () => MentionableUser | undefined;
};

/**
 * The composer's half of the mention picker: when it is open, what goes into the draft, and which
 * keys it takes before the textarea does.
 *
 * The textarea shows a picked person as `@Name`; `toBody` turns the draft into what is sent, with
 * each picked name written as `@[uuid]` (`encodeMentions`). Only picks are converted, so typing a
 * colleague's name by hand does not tag them.
 */
export function useComposerMentions(
  search: MentionSearchControls,
  textarea: React.RefObject<HTMLTextAreaElement | null>,
) {
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const draft = useRef('');

  const noteDraft = useCallback((value: string) => {
    draft.current = value;
  }, []);

  function reactToDraft(value: string, caret: number): void {
    draft.current = value;
    const match = TRAILING_MENTION.exec(value.slice(0, caret));
    const term = match ? (match[1] ?? '') : null;
    // The word pattern allows spaces, so a name just chosen would otherwise reopen the picker.
    const alreadyPicked =
      term !== null &&
      [...names.values()].some(
        (name) => term.startsWith(name) && !WORD_CHARACTER.test(term.charAt(name.length)),
      );
    search.setTerm(alreadyPicked ? null : term);
  }

  const toBody = (value: string): string =>
    encodeMentions(
      value,
      [...names].map(([userId, name]) => ({ userId, name })),
    );

  /** Forgets the picks, so the draft's names go out as plain text. */
  const forget = useCallback(() => setNames(new Map()), []);

  function insert(person: MentionableUser, caret: number): string {
    const before = draft.current.slice(0, caret).replace(MENTION_WORD, '');
    const next = `${before}@${person.name.trim()} ${draft.current.slice(caret)}`;
    setNames((current) => new Map(current).set(person.userId, person.name));
    draft.current = next;
    search.setTerm(null);
    textarea.current?.focus();
    return next;
  }

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

  return { search, names, noteDraft, reactToDraft, insert, handleKey, toBody, forget };
}
