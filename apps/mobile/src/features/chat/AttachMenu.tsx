import { useEffect, useRef } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { IconTile, type IconName, type IconTone } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * What the composer's "+" opens: take a photo, choose one, or attach a document.
 *
 * One button and a sheet of large, coloured choices — the shape phone chat apps use — rather than
 * a row of small grey icons beside the field, which took space from the text and asked people to
 * guess which pictogram meant what.
 *
 * The picker runs only after the sheet has gone: on iOS a camera or photo library presented over a
 * modal that is still sliding away never appears, so the choice waits for the sheet's `onDismiss` —
 * or for a little longer than the slide, because that event has not fired on every React Native
 * release. Whichever comes first runs it, once. Android has no such rule and goes straight away.
 */

/** Longer than the sheet's slide-out, so the fallback never races the animation it waits for. */
const DISMISS_FALLBACK_MS = 450;
export interface AttachChoices {
  onCamera: () => void;
  onPhotos: () => void;
  onDocument: () => void;
}

export function AttachMenu({
  visible,
  onClose,
  onCamera,
  onPhotos,
  onDocument,
}: AttachChoices & { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const pending = useRef<(() => void) | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runPending = () => {
    if (fallback.current) {
      clearTimeout(fallback.current);
      fallback.current = null;
    }
    const action = pending.current;
    pending.current = null;
    action?.();
  };

  useEffect(
    () => () => {
      if (fallback.current) {
        clearTimeout(fallback.current);
      }
    },
    [],
  );

  const choose = (action: () => void) => {
    onClose();
    if (Platform.OS !== 'ios') {
      action();
      return;
    }
    pending.current = action;
    fallback.current = setTimeout(runPending, DISMISS_FALLBACK_MS);
  };

  return (
    <Sheet visible={visible} title="Share" onClose={onClose} onDismiss={runPending} scroll={false}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-around',
          paddingBottom: theme.spacing.lg,
          paddingHorizontal: theme.spacing.screen,
          paddingTop: theme.spacing.sm,
        }}
      >
        <Choice icon="camera" tone="pink" label="Camera" onPress={() => choose(onCamera)} />
        <Choice icon="images" tone="violet" label="Photos" onPress={() => choose(onPhotos)} />
        <Choice
          icon="document-text"
          tone="info"
          label="Document"
          onPress={() => choose(onDocument)}
        />
      </View>
    </Sheet>
  );
}

function Choice({
  icon,
  tone,
  label,
  onPress,
}: {
  icon: IconName;
  tone: IconTone;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        gap: theme.spacing.sm,
        minWidth: 84,
        opacity: pressed ? 0.7 : 1,
        transform: [{ scale: pressed ? 0.95 : 1 }],
      })}
    >
      <IconTile name={icon} tone={tone} size={56} solid style={{ borderRadius: 28 }} />
      <AppText size="sm" weight="medium">
        {label}
      </AppText>
    </Pressable>
  );
}
