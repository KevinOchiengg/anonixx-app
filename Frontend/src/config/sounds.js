/**
 * sounds.js
 *
 * Maps every `welcome_sound` id a user can pick in ChatProfileSetupScreen to
 * the local audio asset that should play when their chat surface welcomes a
 * first-time unlocker (see DropChatScreen's WelcomeMediaOverlay).
 *
 * These asset files do not ship in the repo yet — drop royalty-free .mp3s
 * at the paths below (e.g. from Pixabay Audio or freesound.org, CC0/CC-BY
 * licensed) and this map will pick them up with no other code changes.
 * Until then, WELCOME_SOUND_MAP[id] is undefined and playback is a silent
 * no-op (DropChatScreen already guards the play call in try/catch).
 */

export const WELCOME_SOUND_OPTIONS = [
  { id: 'soft-chime', label: 'Soft Chime' },
  { id: 'warm-bell',  label: 'Warm Bell' },
  { id: 'gentle-hum', label: 'Gentle Hum' },
  { id: 'silence',    label: 'No sound' },
];

// Uncomment and point at real files once they exist under Frontend/assets/sounds/:
// export const WELCOME_SOUND_MAP = {
//   'soft-chime': require('../../assets/sounds/soft-chime.mp3'),
//   'warm-bell':  require('../../assets/sounds/warm-bell.mp3'),
//   'gentle-hum': require('../../assets/sounds/gentle-hum.mp3'),
// };
export const WELCOME_SOUND_MAP = {};
