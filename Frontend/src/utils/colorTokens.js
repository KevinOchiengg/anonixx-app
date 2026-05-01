/**
 * colorTokens.js
 *
 * Re-exports from theme.js for backward compatibility.
 * All Drops/Connect screens that import from here continue to work unchanged.
 *
 * New screens should import directly from theme.js:
 *   import T from '../../utils/theme';
 */

export { T, THEME, default } from './theme';

// ─── Semantic chip states ───────────────────────────────────────
import { T } from './theme';

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
