import { useEffect, useState } from 'react';
import { AccessibilityInfo, Easing, LayoutAnimation, Platform, UIManager } from 'react-native';

/**
 * Motion, kept short and quiet.
 *
 * Every animation in the app is feedback — a press, a section opening, content arriving — never
 * decoration, and each one is skipped for somebody who has asked the system to reduce motion.
 */
export const duration = { fast: 120, base: 200, slow: 280 } as const;

export const easing = Easing.bezier(0.2, 0, 0, 1);

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

let reduceMotion = false;
void AccessibilityInfo.isReduceMotionEnabled?.()
  .then((value) => {
    reduceMotion = value;
  })
  .catch(() => undefined);
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value: boolean) => {
  reduceMotion = value;
});

/** Animates the next layout change: a section opening, an inline form appearing. */
export function animateLayout(): void {
  if (reduceMotion) {
    return;
  }
  LayoutAnimation.configureNext(
    LayoutAnimation.create(duration.base, LayoutAnimation.Types.easeInEaseOut, 'opacity'),
  );
}

/** Whether to skip motion, for components that drive `Animated` themselves. */
export function useReducedMotion(): boolean {
  const [value, setValue] = useState(reduceMotion);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled?.()
      .then((next) => live && setValue(next))
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setValue);
    return () => {
      live = false;
      subscription?.remove();
    };
  }, []);
  return value;
}
