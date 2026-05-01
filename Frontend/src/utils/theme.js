/**
 * theme.js
 * Single source of truth for all Anonixx design tokens.
 *
 * Usage:
 *   import T from '../../utils/theme';           // default export
 *   import { T, THEME } from '../../utils/theme'; // named — both are identical
 *
 *   style={{ color: T.text, backgroundColor: T.surface }}
 */

const palette = {

  // ─── Surfaces ──────────────────────────────────────────────────────────────
  background:   '#0b0f18',   // screen bg (darkest)
  surface:      '#151924',   // cards, inputs, raised layers
  surfaceAlt:   '#1a1f2e',   // secondary raised layer
  surfaceDark:  '#10131c',   // below-surface (chat input bg, deep wells)
  inputBg:      'rgba(255,255,255,0.04)',

  // ─── Text ──────────────────────────────────────────────────────────────────
  text:          '#EAEAF0',   // primary readable text
  textSecondary: '#9A9AA3',   // supporting / meta text
  textSec:       '#9A9AA3',   // alias (used in Drops/payments screens)
  textSub:       '#9A9AA3',   // alias (used in payment components)
  textMuted:     '#4a5068',   // faint / disabled / captions
  textMute:      '#4a5068',   // alias (used in Drops screens)
  inactive:      '#5a5f70',   // tab bar inactive icons, placeholder chrome

  // ─── Primary — coral ───────────────────────────────────────────────────────
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.10)',
  primaryTint:   'rgba(255,99,74,0.08)',
  primaryBorder: 'rgba(255,99,74,0.25)',
  primaryGlow:   'rgba(255,99,74,0.18)',

  // ─── Borders ───────────────────────────────────────────────────────────────
  border:        'rgba(255,255,255,0.06)',
  borderStrong:  'rgba(255,255,255,0.12)',

  // ─── Success / Open / Online — green ───────────────────────────────────────
  success:       '#4CAF50',
  successDim:    'rgba(76,175,80,0.08)',
  successBorder: 'rgba(76,175,80,0.15)',
  open:          '#4CAF50',   // alias — "audio room open" indicator
  openDim:       'rgba(76,175,80,0.12)',
  openBorder:    'rgba(76,175,80,0.25)',
  online:        '#4CAF50',   // alias — presence dot

  // ─── Warning / Caution — orange ────────────────────────────────────────────
  warn:          '#FB923C',
  warning:       '#FB923C',   // alias
  warnDim:       'rgba(251,146,60,0.08)',
  warningDim:    'rgba(251,146,60,0.08)',  // alias
  warningBorder: 'rgba(251,146,60,0.25)',

  // ─── Danger / Error — red ──────────────────────────────────────────────────
  danger:    '#ef4444',
  error:     '#ef4444',       // alias
  dangerDim: 'rgba(239,68,68,0.08)',

  // ─── Live / Broadcast — mirrors primary ────────────────────────────────────
  live:    '#FF634A',
  liveDim: 'rgba(255,99,74,0.15)',

  // ─── Gold — coins, premium, rewards ────────────────────────────────────────
  gold:       '#fbbf24',
  goldDim:    'rgba(251,191,36,0.10)',
  goldBg:     'rgba(251,191,36,0.08)',
  goldBorder: 'rgba(251,191,36,0.30)',

  // ─── Tier 2 / After Dark — purple ──────────────────────────────────────────
  tier2:       '#B36BFF',
  tier2Dim:    'rgba(179,107,255,0.08)',
  tier2Border: 'rgba(179,107,255,0.40)',
  purple:      '#a855f7',     // softer purple alias (referrals, legacy uses)

  // ─── Drop messages — violet ─────────────────────────────────────────────────
  drop:       '#A78BFA',
  dropDim:    'rgba(167,139,250,0.12)',
  dropBorder: 'rgba(167,139,250,0.25)',

  // ─── Payment providers ─────────────────────────────────────────────────────
  mpesa:       '#00A651',
  mpesaDim:    'rgba(0,166,81,0.08)',
  mpesaBorder: 'rgba(0,166,81,0.25)',
  stripe:      '#635BFF',
  stripeDim:   'rgba(99,91,255,0.08)',

  // ─── Chat bubbles ──────────────────────────────────────────────────────────
  myBubble:    '#FF634A',   // own sent message
  theirBubble: '#1e2535',   // received message

  // ─── Avatar / profile defaults ─────────────────────────────────────────────
  avatarBg:   '#1e2330',
  avatarIcon: '#5a5f70',

  // ─── Convenience aliases ───────────────────────────────────────────────────
  bg: '#0b0f18',   // alias for background (used in a few older screens)
};

// Named exports — T is the canonical name, THEME is the legacy alias
export const T     = palette;
export const THEME = palette;
export default palette;
