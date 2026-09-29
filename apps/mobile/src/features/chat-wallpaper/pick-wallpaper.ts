import * as ImagePicker from 'expo-image-picker';

/**
 * A picture from the library for the wallpaper.
 *
 * No crop: a wallpaper is cut to the screen's shape when it is drawn, and a square crop would
 * throw away most of a portrait photo. Nothing is uploaded, so there is no size limit to check.
 */
export type WallpaperPick =
  { kind: 'picked'; uri: string } | { kind: 'cancelled' } | { kind: 'refused'; message: string };

export async function pickWallpaperImage(): Promise<WallpaperPick> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return {
      kind: 'refused',
      message: 'Allow photo access for Ashniva Desk in your device settings to choose a picture.',
    };
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.8,
  });
  const asset = result.canceled ? null : result.assets[0];
  return asset ? { kind: 'picked', uri: asset.uri } : { kind: 'cancelled' };
}
