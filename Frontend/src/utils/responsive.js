/**
 * responsive.js
 * Responsive scaling utility for Anonixx
 *
 * Usage:
 *   import { rs, rf, rp, SCREEN, isSmallDevice } from '../../utils/responsive';
 *
 *   // Scale a size (spacing, width, height)
 *   width: rs(24)        // 24 scaled to screen width
 *
 *   // Scale a font size
 *   fontSize: rf(16)     // 16 scaled + capped for readability
 *
 *   // Scale padding/margin (slightly less aggressive than rs)
 *   padding: rp(20)
 *
 *   // Raw screen dimensions
 *   SCREEN.width, SCREEN.height
 *
 *   // Device helpers
 *   isSmallDevice   — width <= 375 (iPhone SE, older Android)
 *   isMediumDevice  — width 376–414
 *   isLargeDevice   — width >= 415 (Pro Max, large Android)
 *   isTablet        — width >= 768
 */

import { Dimensions, PixelRatio, Platform } from 'react-native';

// ─── Base design dimensions (designed at iPhone 14, 390x844) ──
const BASE_WIDTH  = 390;
const BASE_HEIGHT = 844;

// ─── Live screen dimensions ────────────────────────────────────
let { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const SCREEN = {
  get width()  { return Dimensions.get('window').width; },
  get height() { return Dimensions.get('window').height; },
};

// ─── Width-based scale (layout, spacing, icons) ───────────────
export function rs(size) {
  const scale = SCREEN.width / BASE_WIDTH;
  return Math.round(PixelRatio.roundToNearestPixel(size * scale));
}

// ─── Height-based scale (vertical spacing, container heights) ─
export function rh(size) {
  const scale = SCREEN.height / BASE_HEIGHT;
  return Math.round(PixelRatio.roundToNearestPixel(size * scale));
}

// ─── Font scale (moderately responsive — avoid too-large text) ─
export function rf(size) {
  const scale      = SCREEN.width / BASE_WIDTH;
  const newSize    = size * scale;
  if (Platform.OS === 'ios') {
    return Math.round(PixelRatio.roundToNearestPixel(newSize));
  }
  // Android: normalize by font scale to avoid double-scaling
  return Math.round(PixelRatio.roundToNearestPixel(newSize)) - 2;
}

// ─── Padding/margin scale (gentler than rs) ───────────────────
export function rp(size) {
  const scale = 0.5 * (SCREEN.width / BASE_WIDTH) + 0.5;
  return Math.round(PixelRatio.roundToNearestPixel(size * scale));
}

// ─── Device type helpers ──────────────────────────────────────
export const isSmallDevice  = SCREEN.width <= 375;
export const isMediumDevice = SCREEN.width > 375 && SCREEN.width <= 414;
export const isLargeDevice  = SCREEN.width > 414 && SCREEN.width < 768;
export const isTablet       = SCREEN.width >= 768;

// ─── Safe hit slop (larger on small devices) ─────────────────
export const HIT_SLOP = {
  top:    isSmallDevice ? 12 : 8,
  bottom: isSmallDevice ? 12 : 8,
  left:   isSmallDevice ? 12 : 8,
  right:  isSmallDevice ? 12 : 8,
};

// ─── Common responsive spacing scale ─────────────────────────
export const SPACING = {
  xs:  rp(4),
  sm:  rp(8),
  md:  rp(16),
  lg:  rp(24),
  xl:  rp(32),
  xxl: rp(48),
};

// ─── Common responsive font sizes ────────────────────────────
export const FONT = {
  xs:      rf(11),
  sm:      rf(13),
  md:      rf(15),
  lg:      rf(17),
  xl:      rf(20),
  xxl:     rf(26),
  display: rf(34),
  hero:    rf(42),
};

// ─── Anonixx design tokens (responsive) ──────────────────────
export const RADIUS = {
  sm:   rs(8),
  md:   rs(12),
  lg:   rs(16),
  xl:   rs(20),
  full: rs(999),
};

export const ICON = {
  sm:  rs(16),
  md:  rs(20),
  lg:  rs(24),
  xl:  rs(32),
};

// ─── Input height (consistent across all screens) ────────────
export const INPUT_HEIGHT  = rh(52);
export const BUTTON_HEIGHT = rh(54);

// ─── Percentage of screen ─────────────────────────────────────
export const wp = (percent) => (SCREEN.width  * percent) / 100;
export const hp = (percent) => (SCREEN.height * percent) / 100;
