import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * How close to the bottom still counts as "at the bottom".
 *
 * Not zero: a thread's last line is often part-way through a bubble, and a reader who has nudged
 * the wheel by ten pixels has not started reading history — pinning the threshold at zero makes
 * the view stop following the conversation for no reason they can see.
 */
const BOTTOM_SLACK_PX = 64;

/**
 * The two scroll positions a chat has to hold, and the one it must not take.
 *
 * **It follows the conversation while somebody is at the bottom of it.** A new line arriving scrolls
 * into view, which is what a chat is for.
 *
 * **It stays put while somebody is reading history.** If they have scrolled up, a new line does not
 * move the view — it raises the "new messages" control instead. Yanking a reader to the bottom of a
 * thread they were reading upwards through is the one scroll bug everybody notices.
 *
 * **An older page must not move the view either.** Prepending fifty messages grows the scroll
 * height above the reader; without the correction below, the line they were looking at leaps off
 * the top of the pane. The measurement is taken in a layout effect — after the DOM has the new
 * nodes and before the browser paints — because doing it in a passive effect paints the jump first
 * and then undoes it, which reads as a flash.
 *
 * The element's ref is passed *in* rather than returned: a custom hook that hands a ref back
 * inside an object makes every property of that object look like a ref to the lint rule that
 * guards against reading `.current` during a render.
 */
export function useThreadScroll(
  ref: RefObject<HTMLDivElement | null>,
  newestId: string | undefined,
  oldestId: string | undefined,
) {
  const [isAtBottom, setAtBottom] = useState(true);
  // Read inside layout effects, where a re-render would be too late to be useful.
  const atBottomRef = useRef(true);
  const previous = useRef<{ height: number; top: number } | null>(null);

  const scrollToBottom = useCallback(() => {
    const element = ref.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
      atBottomRef.current = true;
      setAtBottom(true);
    }
  }, [ref]);

  const onScroll = useCallback(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    const next = distance <= BOTTOM_SLACK_PX;
    atBottomRef.current = next;
    setAtBottom((current) => (current === next ? current : next));
  }, [ref]);

  // The live end: only while the reader is already there.
  useLayoutEffect(() => {
    if (atBottomRef.current) {
      scrollToBottom();
    }
  }, [newestId, scrollToBottom]);

  // History: keep the line the reader was looking at exactly where it was.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const before = previous.current;
    previous.current = { height: element.scrollHeight, top: element.scrollTop };
    if (before && !atBottomRef.current && element.scrollHeight > before.height) {
      element.scrollTop = before.top + (element.scrollHeight - before.height);
      previous.current = { height: element.scrollHeight, top: element.scrollTop };
    }
  }, [ref, oldestId]);

  return { onScroll, isAtBottom, scrollToBottom };
}
