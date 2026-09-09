import type { MentionableUser } from '@ashniva/types';
import { Spinner } from '@ashniva/ui';

export interface MentionPickerProps {
  /** What has been typed after the `@`, for the "nobody matches" line. */
  query: string;
  people: readonly MentionableUser[];
  isLoading: boolean;
  /** True when the server has more of this audience than one page holds. */
  hasMore: boolean;
  /** Which option the arrow keys have moved to. The caret stays in the composer. */
  activeIndex: number;
  /** Prefix for each option's id, so the composer can point `aria-activedescendant` at one. */
  idPrefix: string;
  onChoose: (person: MentionableUser) => void;
}

/**
 * Who can be mentioned, and nobody else.
 *
 * Every name here came from `GET /conversations/:id/mentionable`, which resolves the
 * conversation's own audience — for a task thread, the people with a place on the task. The send
 * path refuses a message naming somebody who is not in that same list, so this is not a
 * convenience filter over a directory: it is the one list, and a name it does not offer is a name
 * the API will reject.
 *
 * It does not take focus. The caret stays in the composer, the arrow keys move `activeIndex`
 * there, and this points at the chosen option through `aria-activedescendant` — a picker that
 * stole focus would break the one thing somebody is doing, which is typing a sentence.
 */
export function MentionPicker({
  query,
  people,
  isLoading,
  hasMore,
  activeIndex,
  idPrefix,
  onChoose,
}: MentionPickerProps) {
  if (people.length === 0) {
    return (
      <p id={idPrefix} className="chat-mentions chat-mentions--empty" role="status">
        {isLoading ? (
          <>
            <Spinner size="sm" /> Looking…
          </>
        ) : (
          `Nobody here matches “${query}”.`
        )}
      </p>
    );
  }

  return (
    <ul id={idPrefix} className="chat-mentions" role="listbox" aria-label="Mention somebody">
      {people.map((person, index) => (
        <li key={person.userId}>
          {/* A div rather than a button: this list is driven from the composer's keyboard, and a
              focusable control inside it would put a tab stop between the caret and the send. */}
          <div
            id={`${idPrefix}-${index}`}
            role="option"
            // Reachable programmatically and never a tab stop: the composer's textarea keeps the
            // focus and points at this row with `aria-activedescendant`.
            tabIndex={-1}
            aria-selected={index === activeIndex}
            className={`chat-mentions__option${
              index === activeIndex ? ' chat-mentions__option--active' : ''
            }`}
            onMouseDown={(event) => {
              // Before blur, so choosing with the pointer does not close the picker first.
              event.preventDefault();
              onChoose(person);
            }}
          >
            <span className="chat-mentions__name">{person.name}</span>
            <span className="timeline__note">
              {[person.roleName, person.contextLabel].filter(Boolean).join(' · ')}
            </span>
          </div>
        </li>
      ))}
      {hasMore ? (
        <li className="chat-mentions__more timeline__note">Keep typing to narrow this list.</li>
      ) : null}
    </ul>
  );
}
