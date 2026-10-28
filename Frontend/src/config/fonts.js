/** Maps every fontFamily used in the app to its font file. Loaded once in App.js.
 * The display face is Fraunces; the 'PlayfairDisplay-*' names are kept so screens didn't change. */
import {
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
  Fraunces_700Bold,
  Fraunces_600SemiBold_Italic,
} from '@expo-google-fonts/fraunces';
import {
  DMSans_400Regular,
  DMSans_400Regular_Italic,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { DancingScript_400Regular } from '@expo-google-fonts/dancing-script';
import { Montserrat_800ExtraBold } from '@expo-google-fonts/montserrat';

// Chat fonts (ids match FONT_STYLES in chat_profile.py). `preview` is the family for the picker swatch.
export const CHAT_FONT_OPTIONS = [
  { id: 'clean-regular',       label: 'Clean',      fontFamily: 'DMSans-Regular' },
  { id: 'soft-medium',         label: 'Soft',        fontFamily: 'DMSans-Medium' },
  { id: 'confident-semibold',  label: 'Confident',   fontFamily: 'DMSans-SemiBold' },
  { id: 'bold-statement',      label: 'Bold',        fontFamily: 'Montserrat-ExtraBold' },
  { id: 'elegant-serif',       label: 'Elegant',     fontFamily: 'PlayfairDisplay-Regular' },
  { id: 'elegant-italic',      label: 'Refined',     fontFamily: 'PlayfairDisplay-Italic' },
  { id: 'playful-script',      label: 'Playful',     fontFamily: 'DancingScript-Regular' },
  { id: 'whisper-italic',      label: 'Whisper',     fontFamily: 'DMSans-Italic' },
];

export const CHAT_FONT_MAP = Object.fromEntries(
  CHAT_FONT_OPTIONS.map((f) => [f.id, f.fontFamily])
);

export const DEFAULT_CHAT_FONT = 'clean-regular';

export const FONT_MAP = {
  // Display face: Fraunces (under the old PlayfairDisplay names).
  'PlayfairDisplay-Regular': Fraunces_400Regular,
  'PlayfairDisplay-Italic':  Fraunces_400Regular_Italic,
  'PlayfairDisplay-Bold':    Fraunces_700Bold,
  // Feed caption hooks (components/common/InlineMoreText.jsx), same face as the website's
  'Fraunces-SemiBoldItalic': Fraunces_600SemiBold_Italic,

  // DM Sans
  'DMSans-Regular':  DMSans_400Regular,
  'DMSans-Medium':   DMSans_500Medium,
  'DMSans-SemiBold': DMSans_600SemiBold,
  'DMSans-Bold':     DMSans_700Bold,
  'DMSans-Italic':   DMSans_400Regular_Italic,

  // Drop card font-style presets (DropCardRenderer.jsx CARD_FONT_STYLES)
  'DancingScript-Regular': DancingScript_400Regular,
  'Montserrat-ExtraBold':  Montserrat_800ExtraBold,
};
