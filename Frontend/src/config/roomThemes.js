/** Room colour themes, used only inside a Room. Ids match chat_profile.py and Web/lib/roomThemes.ts.
 * Text contrast is at least 6.7:1. */

const t = (id, name, room, mood, bg, surface, accent, accent2, text, muted, accentRgb, accent2Rgb) => ({
  id, name, room, mood, bg, surface, accent, accent2, text, muted,
  border: `rgba(${accentRgb},0.16)`,
  borderStrong: `rgba(${accentRgb},0.34)`,
  glow: `rgba(${accentRgb},0.22)`,
  glow2: `rgba(${accent2Rgb},0.12)`,
  tint: `rgba(${accentRgb},0.1)`,
});

export const ROOM_THEMES = [
  t('midnight-blue', 'Midnight Blue', 'The Mysterious Room', 'Cool, calm, exclusive.',
    '#080D1A', '#111A2B', '#8BA9FF', '#5EEAD4', '#E8EEFC', '#9CA9C4', '139,169,255', '94,234,212'),
  t('velvet-burgundy', 'Velvet Burgundy', 'The Seductive Room', 'Intimate, sensual, elegant.',
    '#14080F', '#24101C', '#F06A8B', '#D8A0B5', '#F8E9EF', '#C29AAB', '240,106,139', '216,160,181'),
  t('dark-plum', 'Dark Plum', 'The Secret Room', 'Enigmatic, dreamy, private.',
    '#100A18', '#20142B', '#C5A3FF', '#F0A6D5', '#F1EAFB', '#AE9DC4', '197,163,255', '240,166,213'),
  t('obsidian-gold', 'Obsidian Gold', 'The Luxury Room', 'Expensive, confident, refined.',
    '#0C0C0D', '#191817', '#D6B56D', '#F0D9A0', '#F5F0E6', '#ABA391', '214,181,109', '240,217,160'),
  t('smoky-emerald', 'Smoky Emerald', 'The Enchanted Room', 'Calm, intriguing, quietly seductive.',
    '#07130F', '#10231B', '#65D6A6', '#C4E7B5', '#E7F5EE', '#93B5A5', '101,214,166', '196,231,181'),
  t('obsidian-rose', 'Obsidian Rose', 'The Intimate Room', 'Warm, playful, affectionate.',
    '#130A10', '#24131D', '#FF8FAF', '#F5C6D6', '#FBEDF2', '#C6A0B0', '255,143,175', '245,198,214'),
  t('arctic-silver', 'Arctic Silver', 'The Cool Room', 'Minimal, composed, effortlessly cool.',
    '#0B1015', '#171F27', '#C3D3E3', '#83B8D9', '#EDF2F7', '#9AA8B6', '195,211,227', '131,184,217'),
  t('deep-ocean', 'Deep Ocean', 'The After-Dark Room', 'Nocturnal, immersive, cinematic.',
    '#061117', '#0E2028', '#55C7D9', '#7C9EFF', '#E4F3F7', '#8FB0BA', '85,199,217', '124,158,255'),
  t('ember', 'Ember', 'The Passion Room', 'Warm, bold, energetic.',
    '#170B07', '#29140E', '#FF9B62', '#FFD09B', '#FCEEE6', '#C7A491', '255,155,98', '255,208,155'),
  t('pure-noir', 'Pure Noir', 'The Minimalist Room', 'Timeless, discreet, understated.',
    '#080808', '#151515', '#E7E7E7', '#929292', '#F2F2F2', '#A3A3A3', '231,231,231', '146,146,146'),
];

export const DEFAULT_ROOM_THEME = 'midnight-blue';

export const roomThemeById = (id) => ROOM_THEMES.find((x) => x.id === id) || ROOM_THEMES[0];

export const ROOM_STATUSES = [
  { id: 'open', label: 'Open to knocks' },
  { id: 'late', label: 'Up late' },
  { id: 'quiet', label: 'Quiet tonight' },
  { id: 'away', label: 'Away for now' },
];

export const statusLabel = (id) => ROOM_STATUSES.find((s) => s.id === id)?.label || null;

export const GALLERY_VISIBILITY = [
  { id: 'window', label: 'Everyone peeking', hint: 'Shown through your window before anyone knocks.' },
  { id: 'inside', label: 'Only people I let in', hint: 'Visitors see that you have photos, not the photos.' },
  { id: 'only_me', label: 'Only me', hint: "Kept private. Letting someone in doesn't change this." },
];

/** Openers shown after a Let In. Tapping one only fills the box; nothing is sent for you. */
export const STARTERS = [
  'Your Room said more than your post did.',
  "Okay, I'm in. Now what?",
  "I've been curious since I saw your post.",
  "Tell me the part you didn't write.",
];

export const MAX_INTRO = 160;
export const MAX_WELCOME = 280;
