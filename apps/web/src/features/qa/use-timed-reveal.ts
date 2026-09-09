import type { RevealedCredential } from '@ashniva/types';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Holds a revealed test password for exactly as long as the server said, and then forgets it.
 *
 * Everything about this hook is about where the value is *not*. It is never handed to React Query
 * (a cache entry outlives the screen and is readable from anywhere in the app), never written to
 * storage, never put in a URL and never logged. It lives in one component's state, a timer clears
 * it, and unmounting clears it too — closing the card is the same as the countdown running out.
 *
 * `visibleForSeconds` comes from the response rather than a constant here, so the countdown on
 * screen is the one the API decided.
 */
export interface TimedReveal {
  /** The credential while it is on screen, or null before a reveal and after it lapses. */
  revealed: RevealedCredential | null;
  secondsLeft: number;
  /** True once a reveal has lapsed, so the card can say so instead of looking untouched. */
  hasLapsed: boolean;
  show: (credential: RevealedCredential) => void;
  hide: () => void;
}

export function useTimedReveal(): TimedReveal {
  const [revealed, setRevealed] = useState<RevealedCredential | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [hasLapsed, setHasLapsed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    stopTimer();
    setRevealed(null);
    setSecondsLeft(0);
  }, [stopTimer]);

  const show = useCallback(
    (credential: RevealedCredential) => {
      stopTimer();
      setHasLapsed(false);
      setRevealed(credential);
      setSecondsLeft(credential.visibleForSeconds);
      timerRef.current = setInterval(() => {
        setSecondsLeft((left) => {
          if (left <= 1) {
            stopTimer();
            setRevealed(null);
            setHasLapsed(true);
            return 0;
          }
          return left - 1;
        });
      }, 1000);
    },
    [stopTimer],
  );

  // Unmounting is a reveal ending: the interval is dropped and the state goes with the component,
  // so nothing keeps a reference to the plaintext once the card leaves the screen.
  useEffect(() => stopTimer, [stopTimer]);

  return { revealed, secondsLeft, hasLapsed, show, hide };
}
