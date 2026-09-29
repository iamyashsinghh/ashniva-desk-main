import type { SessionUser } from '@ashniva/types';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ListRow } from '../../shared/components/data-display';
import { Banner } from '../../shared/components/feedback';
import { Button, Divider } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { AvatarPresetGrid } from './AvatarPresetGrid';
import { useProfilePicture } from './use-profile-picture';

/**
 * Changing your picture: a photo from the camera or the library, one of the built-in avatars, or
 * nothing — your initials.
 *
 * "Remove picture" is offered only when there is one to remove. A refused permission or an
 * oversized photo is a sentence in the sheet rather than an alert, so the other choices stay one
 * tap away.
 */
export function ProfilePictureSheet({
  visible,
  user,
  onClose,
}: {
  visible: boolean;
  user: SessionUser;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [mode, setMode] = useState<'menu' | 'presets'>('menu');
  const picture = useProfilePicture();

  const close = () => {
    setMode('menu');
    picture.clearErrors();
    onClose();
  };
  // One change at a time: a second tap while a photo uploads would race the first to the API.
  const whenIdle = (action: () => Promise<boolean> | void) => () => {
    if (picture.busy) {
      return;
    }
    const pending = action();
    if (pending) {
      void pending.then((worked) => {
        if (worked) {
          close();
        }
      });
    }
  };

  return (
    <Sheet
      visible={visible}
      title={mode === 'menu' ? 'Profile picture' : 'Choose an avatar'}
      subtitle={
        mode === 'menu' ? 'Shown beside your name to everyone you work with' : 'Tap one to use it'
      }
      onClose={close}
      {...(mode === 'presets'
        ? {
            footer: (
              <Button
                label="Back"
                variant="secondary"
                onPress={() => setMode('menu')}
                style={{ flex: 1 }}
              />
            ),
          }
        : {})}
    >
      {picture.error ? (
        <Banner tone="danger" role="alert">
          {picture.error}
        </Banner>
      ) : null}
      {picture.busy ? (
        <View
          accessibilityLabel="Saving your picture"
          style={{ paddingVertical: theme.spacing.xs }}
        >
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : null}

      {mode === 'presets' ? (
        <AvatarPresetGrid
          user={user}
          disabled={picture.busy}
          onChoose={(preset) => whenIdle(() => picture.choosePreset(preset))()}
        />
      ) : (
        <View>
          <ListRow
            icon="camera-outline"
            title="Take photo"
            onPress={whenIdle(() => picture.setPhoto('camera'))}
          />
          <Divider inset={48} />
          <ListRow
            icon="images-outline"
            iconTone="info"
            title="Choose from library"
            onPress={whenIdle(() => picture.setPhoto('library'))}
          />
          <Divider inset={48} />
          <ListRow
            icon="happy-outline"
            iconTone="violet"
            title="Choose an avatar"
            subtitle="If you would rather not use a photo"
            onPress={whenIdle(() => setMode('presets'))}
          />
          {user.avatar ? (
            <>
              <Divider inset={48} />
              <ListRow
                icon="trash-outline"
                title="Remove picture"
                subtitle="Your initials are shown instead"
                destructive
                onPress={whenIdle(() => picture.removePicture())}
              />
            </>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}
