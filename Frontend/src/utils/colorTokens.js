/**
 * colorTokens.js
 *
 * Single source of truth for Anonixx Drops colour palette + semantic styles.
 * Every drops/connect screen imports from here — no local re-definitions.
 *
 * Design reference: DropsComposeScreen.jsx (the compose flow ships the
 * canonical look. Everything else is being pulled into alignment.)
 *
 * Usage:
 *   import { T, ACCENT } from '../../utils/colorTokens';
 *   style={{ color: T.text, backgroundColor: T.surface }}
 */

// ─── Core palette ──────────────────────────────────────────────
export const T = {
  // Surfaces
  background: '#0b0f18',   // screen bg
  surface:    '#151924',   // cards, inputs, raised layers
  surfaceAlt: 'rgba(255,255,255,0.02)', // subtle tint over background

  // Text
  text:       '#EAEAF0',   // primary
  textSec:    '#9A9AA3',   // secondary / section labels
  textMute:   '#4a4f62',   // tertiary / counters / captions

  // Accent (coral — shared across all Drop surfaces)
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.06)',   // faint tint for active chip bg
  primaryTint:   'rgba(255,99,74,0.08)',   // slightly stronger
  primaryBorder: 'rgba(255,99,74,0.4)',    // active chip border
  primaryGlow:   'rgba(255,99,74,0.18)',   // hint-box border

  // Borders
  border:     'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.12)',

  // Status
  warn:       '#FB923C',
  warnDim:    'rgba(251,146,60,0.08)',
  danger:     '#ef4444',
  dangerDim:  'rgba(239,68,68,0.08)',
  success:    '#22c55e',
  successDim: 'rgba(34,197,94,0.08)',

  // Tier 2 (After Dark) — unlocked at age-verify
  tier2:       '#B36BFF',
  tier2Dim:    'rgba(179,107,255,0.08)',
  tier2Border: 'rgba(179,107,255,0.4)',
};

// ─── Semantic chip states (used by ChipRow, intensity, audience, etc.) ──
export const CHIP = {
  idle: {
    borderColor:     T.border,
    backgroundColor: 'transparent',
  },
  active: {
    borderColor:     T.primaryBorder,
    backgroundColor: T.primaryDim,
  },
};

// ─── Entrance animation defaults ───────────────────────────────
export const ENTRANCE = {
  fadeDuration:  320,
  slideDuration: 380,
  stagger:       60,
};

export default T;
