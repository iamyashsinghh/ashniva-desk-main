import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * Arrow-key movement inside a composite widget, shared by `Tabs` and `SegmentedControl`.
 *
 * Both declare a role — `tablist` and `radiogroup` — that promises the arrow keys move between
 * the options and that only one option is in the tab order. Neither delivered it: every option
 * was a separate tab stop, so a task list with nine view chips cost a keyboard user nine presses
 * to walk past, and the arrow keys did nothing at all.
 *
 * Selection follows focus in both widgets. That is the right call here because every option is a
 * filter over data already loaded and switching is instant; where switching is expensive, the
 * pattern is to move focus without selecting, and this helper would not be the thing to use.
 *
 * Returns the key to select, or null when the event is not one it handles.
 */
export function nextKeyForArrowPress<TKey extends string>(
  event: ReactKeyboardEvent,
  keys: readonly TKey[],
  current: TKey,
): TKey | null {
  if (keys.length === 0) {
    return null;
  }
  const index = keys.indexOf(current);
  const position = index === -1 ? 0 : index;

  switch (event.key) {
    // Left/Right and Up/Down both work: the strip is horizontal on a desktop and wraps to
    // several rows on a narrow screen, where "next" is as much down as it is right.
    case 'ArrowRight':
    case 'ArrowDown':
      return keys[(position + 1) % keys.length] ?? null;
    case 'ArrowLeft':
    case 'ArrowUp':
      return keys[(position - 1 + keys.length) % keys.length] ?? null;
    case 'Home':
      return keys[0] ?? null;
    case 'End':
      return keys[keys.length - 1] ?? null;
    default:
      return null;
  }
}
