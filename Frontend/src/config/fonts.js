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
 */
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_500Medium,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import {
  DMSans_400Regular,
  DMSans_400Regular_Italic,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { DancingScript_400Regular } from '@expo-google-fonts/dancing-script';
import { Montserrat_800ExtraBold } from '@expo-google-fonts/montserrat';

export const FONT_MAP = {
  // Playfair Display — hyphenated naming used throughout most screens
  'PlayfairDisplay-Regular': PlayfairDisplay_400Regular,
  'PlayfairDisplay-Italic':  PlayfairDisplay_400Regular_Italic,
  'PlayfairDisplay-Bold':    PlayfairDisplay_700Bold,
  // Same family, Google-Fonts-native naming (used by FullScreenPostCard.jsx)
  'PlayfairDisplay_500Medium': PlayfairDisplay_500Medium,
  'PlayfairDisplay_700Bold':   PlayfairDisplay_700Bold,

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
