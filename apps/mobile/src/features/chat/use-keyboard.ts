import { useCallback, useEffect, useState } from 'react';
import { Keyboard, Platform, type LayoutChangeEvent } from 'react-native';

/**
 * Whether the software keyboard is up.
 *
 * iOS announces the keyboard *before* it moves, Android only after, so each platform listens for
 * the earliest event it has — the composer drops its home-indicator padding in step with the
 * keyboard rather than a beat behind it.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(() => Keyboard.isVisible?.() ?? false);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const shown = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setVisible(true),
    );
    const hidden = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setVisible(false),
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return visible;
}

/**
 * How far down the screen a `KeyboardAvoidingView` starts, for its `keyboardVerticalOffset`.
 *
 * The view compares the keyboard's top — in screen coordinates — with its own frame, which it only
 * knows relative to its parent, so the offset has to be exactly where its parent sits on screen.
 * Guessing that as "status bar plus a 44-point header" is right for one iOS header and wrong for
 * Android's taller one, where the composer ended up half under the keyboard. Measured, it is right
 * for whatever header, banner or tab bar is above.
 */
export function useWindowTop() {
  const [top, setTop] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    event.currentTarget?.measureInWindow?.((_x, y) => {
      if (Number.isFinite(y)) {
        setTop(y);
      }
    });
  }, []);
  return { onLayout, top };
}
