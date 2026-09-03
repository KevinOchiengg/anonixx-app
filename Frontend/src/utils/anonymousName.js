/**
 * Anonymous name format — shared by SignUpScreen and EditProfileScreen.
 * Mirrors Backend/app/api/v1/auth.py's _ANON_NAME_RE: letters, numbers,
 * dots, hyphens, underscores, and emoji.
 *
 * Built from code points rather than \u escapes since several emoji
 * ranges (pictographs, flags) sit outside the BMP and need surrogate
 * pairs — String.fromCodePoint handles that correctly with the 'u' flag.
 */
const codePointRange = (start, end) =>
  String.fromCodePoint(start) + '-' + String.fromCodePoint(end);

const EMOJI_RANGES = [
  [0x1f300, 0x1faff], // symbols & pictographs (incl. extended-A)
  [0x2600, 0x27bf],   // misc symbols & dingbats
  [0x1f1e6, 0x1f1ff], // regional indicators (flag emoji)
]
  .map(([start, end]) => codePointRange(start, end))
  .join('');

// Variation selector-16 + zero-width joiner — needed for compound emoji
// (flags, skin-tone modifiers, family emoji) to render as one glyph.
const JOINERS = String.fromCodePoint(0xfe0f) + String.fromCodePoint(0x200d);

export const ANONYMOUS_NAME_RE = new RegExp(
  `^[a-zA-Z0-9._\\-${EMOJI_RANGES}${JOINERS}]{3,30}$`,
  'u'
);

export const ANONYMOUS_NAME_HINT =
  'Letters, numbers, dots, hyphens, underscores or emoji, 3–30 characters.';
