/**
 * config/featureFlags.js
 *
 * Toggle native features that require an EAS build.
 * Set IS_EAS_BUILD to true before running `eas build`.
 * Keep false when using `npx expo start` (Expo Go).
 */

export const IS_EAS_BUILD = false;

export const FEATURES = {
  // expo-notifications — push token registration + receiving
  pushNotifications: IS_EAS_BUILD,

  // expo-video — replaces expo-av Video component
  nativeVideo: IS_EAS_BUILD,

  // expo-video-thumbnails — generates video preview images
  videoThumbnails: IS_EAS_BUILD,

  // Picture-in-Picture (expo-video only)
  pictureInPicture: IS_EAS_BUILD,
};
