import { useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { useDrawer } from './drawer-context';

/** How far right a finger must travel from the edge before letting go opens the menu. */
const OPEN_DISTANCE = 48;

/**
 * A thin strip down the left edge of the tab screens: a swipe right from it opens the side menu,
 * as it does in most apps with one.
 *
 * Only on the tabs. Every other screen is on the native stack, where the same gesture is the
 * system's "back" on iOS and must keep meaning that.
 */
export function EdgeSwipe() {
  const drawer = useDrawer();
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        gesture.dx > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx > OPEN_DISTANCE) {
          drawer.open();
        }
      },
    }),
  );

  return <View style={styles.strip} {...responder.panHandlers} />;
}

const styles = StyleSheet.create({
  strip: { bottom: 90, left: 0, position: 'absolute', top: 100, width: 18 },
});
