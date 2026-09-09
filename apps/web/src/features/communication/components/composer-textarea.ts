/**
 * Grows the composer's box to fit what is in it, up to the cap the stylesheet sets.
 *
 * Done in script rather than with `field-sizing: content`, which Firefox and Safari do not yet
 * have. The height is cleared first so the box can shrink again when a paragraph is deleted.
 *
 * It lives beside the composer rather than inside it because `MessageComposer` had reached the
 * house's line limit for a component, and of everything in that file this is the part with no
 * opinion about messages at all.
 */
export function grow(element: HTMLTextAreaElement | null, reset = false): void {
  if (!element) {
    return;
  }
  element.style.height = 'auto';
  element.style.height = reset ? '' : `${element.scrollHeight}px`;
}
