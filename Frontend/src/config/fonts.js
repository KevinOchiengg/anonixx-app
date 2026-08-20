/**
 * fonts.js
 *
 * Maps every `fontFamily` string already referenced across the app (grep
 * `fontFamily:` in src/) to the real Google Fonts asset that should render
 * it. Load this once via `useFonts(FONT_MAP)` in App.js — once loaded, every
 * screen that already references e.g. 'PlayfairDisplay-Italic' just starts
 * rendering correctly, with no per-screen changes needed.
 *
 * Before this existed, none of these fontFamily strings resolved to
 * anything — React Native was silently falling back to the system font
 * everywhere.
 *
 * The app's identity/display face is Fraunces, not Playfair Display — the
 * 'PlayfairDisplay-*' key names are legacy from before the swap. Keeping the
 * old names here (rather than renaming across ~40 screen files) means the
 * whole app's typography moved in one place with zero per-screen risk.
 * Fraunces was chosen over Playfair for its warmer, softer terminals —
 * intimate rather than editorial — which fits Anonixx's confession/hookup
 * tone better. This also means the chat bubble font picker's "Elegant" /
 * "Refined" options (below) render in Fraunces now too, which still fits
 * those labels.
 */
import {
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
  Fraunces_700Bold,
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

// Curated chat-bubble fonts — ids match Backend/app/api/v1/chat_profile.py
// FONT_STYLES. All reuse assets already bundled via FONT_MAP below, so
// picking one needs no new downloads. `preview` is the literal fontFamily
// string to render an "Aa" swatch in, for a live picker in
// ChatProfileSetupScreen.
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
  // Identity/display face — Fraunces. Keys keep the historical "PlayfairDisplay"
  // name (swapped from actual Playfair Display) so none of the ~40 screens
  // referencing these fontFamily strings needed touching — see fonts.js header.
  'PlayfairDisplay-Regular': Fraunces_400Regular,
  'PlayfairDisplay-Italic':  Fraunces_400Regular_Italic,
  'PlayfairDisplay-Bold':    Fraunces_700Bold,

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
