import type { RevealedCredential } from '@ashniva/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Holds a revealed test password for exactly as long as the server said, and then forgets it.
 *
 * Everything about this hook is about where the value is *not*. It is never handed to React Query
 * (a cache entry outlives the screen and is readable from anywhere in the app), never written to
 * storage and never logged. It lives in one component's state, a timer clears it, and unmounting
 * clears it too.
 *
 * One rule the web version does not need: leaving the app hides it. The app switcher takes a
 * snapshot of the screen as it goes to the background, and a password in that snapshot would
 * outlive the countdown by as long as the snapshot is kept.
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

  const lapse = useCallback(() => {
    stopTimer();
    setRevealed(null);
    setSecondsLeft(0);
    setHasLapsed(true);
  }, [stopTimer]);

  const show = useCallback(
    (credential: RevealedCredential) => {
      stopTimer();
      setHasLapsed(false);
      setRevealed(credential);
      setSecondsLeft(credential.visibleForSeconds);
      // Counted against a deadline rather than by decrementing, so a slow JS thread cannot stretch
      // the window past what the server allowed.
      const deadline = Date.now() + credential.visibleForSeconds * 1000;
      timerRef.current = setInterval(() => {
        const left = Math.ceil((deadline - Date.now()) / 1000);
        if (left <= 0) {
          lapse();
        } else {
          setSecondsLeft(left);
        }
      }, 1000);
    },
    [stopTimer, lapse],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        lapse();
      }
    });
    return () => subscription.remove();
  }, [lapse]);

  // Unmounting is a reveal ending: the interval is dropped and the state goes with the component.
  useEffect(() => stopTimer, [stopTimer]);

  return { revealed, secondsLeft, hasLapsed, show, hide };
}
