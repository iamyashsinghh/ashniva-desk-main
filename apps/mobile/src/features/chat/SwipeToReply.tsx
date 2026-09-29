import * as Haptics from 'expo-haptics';
import { useMemo, useState, type ReactNode } from 'react';
import { Animated, PanResponder, View, type PanResponderGestureState } from 'react-native';

import { Icon } from '../../shared/components/Icon';
import { useTheme } from '../../shared/theme/ThemeProvider';

/** How far the bubble must travel before letting go counts as "reply". */
export const TRIGGER_PX = 56;
/** The furthest it follows the finger; past this it resists, so it never leaves the screen. */
const MAX_PX = 80;

/**
 * Drag a message to the right to answer it — the gesture phone chats have taught.
 *
 * Built on React Native's own responder rather than a gesture library, so it adds no native
 * module. It claims the touch only for a clearly sideways drag, which leaves the thread's
 * vertical scroll alone, and it is never the only way in: the long-press menu and the screen
 * reader's actions offer the same reply.
 *
 * **The responder must survive re-renders.** The thread re-renders every bubble whenever a line
 * arrives or a refetch lands, and a responder rebuilt mid-drag starts its gesture from nothing —
 * the bubble jumped and the release never counted. So it is memoised on `onReply`, which the
 * bubble keeps stable for as long as its message is unchanged.
 */
export function SwipeToReply({
  enabled,
  onReply,
  children,
}: {
  enabled: boolean;
  onReply: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  const [offset] = useState(() => new Animated.Value(0));

  const responder = useMemo(() => {
    const sideways = (gesture: PanResponderGestureState) =>
      gesture.dx > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2;
    // Whether this drag has passed the threshold, so the tick is felt once per crossing rather
    // than on every move event past it.
    const drag = { armed: false };
    const settle = (bounciness: number) => {
      drag.armed = false;
      Animated.spring(offset, { toValue: 0, useNativeDriver: true, bounciness }).start();
    };
    return PanResponder.create({
      // Capture as well, so a drag that began on the bubble's long-press target still slides it.
      onMoveShouldSetPanResponderCapture: (_event, gesture) => sideways(gesture),
      onMoveShouldSetPanResponder: (_event, gesture) => sideways(gesture),
      // Once sideways, stays sideways: the list must not turn it into a scroll half-way through.
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_event, gesture) => {
        const dx = Math.max(0, gesture.dx);
        offset.setValue(dx > MAX_PX ? MAX_PX + (dx - MAX_PX) * 0.2 : dx);
        const past = dx >= TRIGGER_PX;
        if (past !== drag.armed) {
          drag.armed = past;
          if (past) {
            tick();
          }
        }
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx >= TRIGGER_PX) {
          onReply();
        }
        settle(6);
      },
      onPanResponderTerminate: () => settle(0),
    });
  }, [offset, onReply]);

  if (!enabled) {
    return <>{children}</>;
  }

  const hint = offset.interpolate({
    inputRange: [0, TRIGGER_PX],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View>
      <Animated.View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        style={{
          alignItems: 'center',
          bottom: 0,
          justifyContent: 'center',
          left: 0,
          opacity: hint,
          position: 'absolute',
          top: 0,
          transform: [{ scale: hint }],
          width: TRIGGER_PX - 8,
        }}
      >
        <View
          style={{
            alignItems: 'center',
            backgroundColor: theme.colors.primarySoft,
            borderRadius: theme.radius.pill,
            height: 32,
            justifyContent: 'center',
            width: 32,
          }}
        >
          <Icon name="arrow-undo" size={16} color={theme.colors.primary} />
        </View>
      </Animated.View>
      <Animated.View
        testID="swipe-to-reply"
        style={{ transform: [{ translateX: offset }] }}
        {...responder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

/** A light tick where the device has one. Never allowed to fail the gesture it accompanies. */
function tick() {
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  } catch {
    // No haptics module on this device or in this build.
  }
}
