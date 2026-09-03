/**
 * Circle content categories — shared between CreateCircleScreen (picker)
 * and CirclesScreen (filter chips) so the two never drift apart.
 * Must be kept in sync with CIRCLE_CATEGORIES in Backend/app/api/v1/circles.py.
 */
export const CIRCLE_CATEGORIES = [
  { id: 'photos',      label: 'Photos',      emoji: '📸' },
  { id: 'videos',      label: 'Videos',      emoji: '🎬' },
  { id: 'audio',       label: 'Audio',       emoji: '🎙️' },
  { id: 'confessions', label: 'Confessions', emoji: '🕯️' },
  { id: 'music',       label: 'Music',       emoji: '🎵' },
  { id: 'comedy',      label: 'Comedy',      emoji: '😂' },
  { id: 'art',         label: 'Art',         emoji: '🎨' },
  { id: 'spicy',       label: 'Spicy',       emoji: '🌶️' },
];
