/**
 * patterns.js
 *
 * Curated chat-background patterns — each a gradient + an optional
 * procedural overlay (dots / noise / lines / grid / glow), no image assets
 * needed. Ids match Backend/app/api/v1/chat_profile.py BACKGROUND_PATTERNS;
 * rendering lives in components/chat/ChatBackground.jsx.
 *
 * Palette stays dark and moody on purpose — this is the surface someone
 * sees the moment they unlock an anonymous chat, so it leans into mystery/
 * intimacy rather than looking like a generic messaging app.
 */

export const BACKGROUND_PATTERNS = [
  {
    id: 'midnight-solid',
    label: 'Midnight',
    gradient: ['#151924', '#0b0e16'],
    overlay: { kind: 'none' },
  },
  {
    id: 'velvet-dots',
    label: 'Velvet',
    gradient: ['#2a0f1e', '#12060d'],
    overlay: { kind: 'dots', color: 'rgba(255,182,193,0.35)', density: 26 },
  },
  {
    id: 'smoke-lines',
    label: 'Smoke',
    gradient: ['#221a2e', '#0e0a16'],
    overlay: { kind: 'lines', color: 'rgba(255,255,255,0.06)', count: 10 },
  },
  {
    id: 'ember-glow',
    label: 'Ember',
    gradient: ['#2e1408', '#140803'],
    overlay: { kind: 'glow', color: 'rgba(255,99,74,0.28)' },
  },
  {
    id: 'obsidian-grid',
    label: 'Obsidian',
    gradient: ['#0e0e12', '#050506'],
    overlay: { kind: 'grid', color: 'rgba(255,255,255,0.05)', cell: 28 },
  },
  {
    id: 'rose-noise',
    label: 'Rose',
    gradient: ['#33101c', '#160810'],
    overlay: { kind: 'noise', color: 'rgba(255,120,150,0.18)', density: 60 },
  },
  {
    id: 'eclipse-mesh',
    label: 'Eclipse',
    gradient: ['#1a1030', '#080513'],
    overlay: { kind: 'lines', color: 'rgba(180,150,255,0.10)', count: 14, crosshatch: true },
  },
  {
    id: 'static-haze',
    label: 'Haze',
    gradient: ['#1c1c1e', '#0a0a0b'],
    overlay: { kind: 'noise', color: 'rgba(255,255,255,0.10)', density: 45 },
  },
  {
    id: 'crimson-fade',
    label: 'Crimson',
    gradient: ['#3a0a14', '#0d0305'],
    overlay: { kind: 'none' },
  },
  {
    id: 'ink-bloom',
    label: 'Ink Bloom',
    gradient: ['#0c0c18', '#030307'],
    overlay: { kind: 'glow', color: 'rgba(120,90,255,0.22)' },
  },
];

export const BACKGROUND_PATTERN_MAP = Object.fromEntries(
  BACKGROUND_PATTERNS.map((p) => [p.id, p])
);

export const DEFAULT_BACKGROUND_PATTERN = 'midnight-solid';
