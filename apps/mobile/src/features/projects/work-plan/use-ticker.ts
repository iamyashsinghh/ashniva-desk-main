import { useEffect, useState } from 'react';

/**
 * The current time, re-read every second while `active`.
 *
 * Each running clock owns its own interval rather than the screen ticking the whole plan: a
 * one-second re-render of every phase, topic and picker would be felt on a long plan.
 */
export function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const tick = () => setNow(Date.now());
    // A clock that starts after mount would otherwise show a stale time for up to a second.
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active]);
  return now;
}
