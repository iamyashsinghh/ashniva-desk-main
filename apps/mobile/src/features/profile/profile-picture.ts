import { AVATAR_CONTENT_TYPES, MAX_AVATAR_BYTES } from '@ashniva/types';
import * as ImagePicker from 'expo-image-picker';

/**
 * Choosing a profile photo.
 *
 * The picker crops to a square and compresses before anything is sent, which on a phone camera
 * lands well under the API's limit. The limit and the accepted types are still checked here, from
 * `@ashniva/types` rather than copied: a photo the API would refuse is refused before somebody's
 * cellular data carries it. The API checks the bytes and has the final word.
 *
 * There is no downscaling fallback for a photo that is still too large: that needs an image
 * manipulation module this app does not ship, and saying so costs less than adding one.
 */

/** A photo the person chose, in the three fields React Native's multipart body wants. */
export interface PickedPhoto {
  uri: string;
  name: string;
  type: string;
}

/**
 * What choosing came to.
 *
 * Cancelling is not an error — backing out of a picker is an ordinary thing to do. A refusal is
 * worth a sentence, because on both platforms "no" is permanent until system settings.
 */
export type PhotoChoice =
  | { kind: 'picked'; photo: PickedPhoto }
  | { kind: 'cancelled' }
  | { kind: 'refused'; message: string };

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.7,
};

export async function choosePhoto(source: 'camera' | 'library'): Promise<PhotoChoice> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return {
      kind: 'refused',
      message:
        source === 'camera'
          ? 'Allow camera access for Ashniva Desk in your device settings to take a photo.'
          : 'Allow photo access for Ashniva Desk in your device settings to choose a picture.',
    };
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
      : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) {
    return { kind: 'cancelled' };
  }

  if (asset.fileSize !== undefined && asset.fileSize > MAX_AVATAR_BYTES) {
    return {
      kind: 'refused',
      message: `That picture is larger than ${Math.round(MAX_AVATAR_BYTES / (1024 * 1024))} MB. Try a smaller one, or crop it more tightly.`,
    };
  }
  const type = asset.mimeType ?? 'image/jpeg';
  if (!(AVATAR_CONTENT_TYPES as readonly string[]).includes(type)) {
    return {
      kind: 'refused',
      message: 'That picture is in a format that cannot be used. Choose a JPEG, PNG or WebP.',
    };
  }

  return {
    kind: 'picked',
    photo: { uri: asset.uri, name: asset.fileName ?? `avatar-${Date.now()}.jpg`, type },
  };
}

/** The multipart body `POST /users/me/avatar` takes: one part, named `file`. */
export function avatarForm(photo: PickedPhoto): FormData {
  const form = new FormData();
  // React Native's FormData takes this three-field object where a browser takes a Blob, and reads
  // the file off disk while it streams the request.
  form.append('file', { uri: photo.uri, name: photo.name, type: photo.type } as unknown as Blob);
  return form;
}
