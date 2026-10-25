import type { CSSProperties } from "react";

/**
 * Room themes: the palette one person's Room is painted in. Scoped to the
 * Room (via --rt-* custom properties on the Room's root), so the Anonixx
 * shell, nav and brand colours never change. Ids match the backend's
 * ROOM_THEMES (Backend/app/api/v1/chat_profile.py) and
 * Frontend/src/config/roomThemes.js.
 *
 * Contrast checked (WCAG): text and muted text are ≥ 6.9:1 on the surface,
 * and the bg colour used as label text on an accent button is ≥ 6.7:1.
 */
export type RoomTheme = {
  id: string;
  name: string;
  room: string;   // "The Mysterious Room"
  mood: string;
  bg: string;
  surface: string;
  accent: string;
  accent2: string;
  text: string;
  muted: string;
  /** rgb triplets for translucent borders / glows */
  accentRgb: string;
  accent2Rgb: string;
};

export const ROOM_THEMES: RoomTheme[] = [
  { id: "midnight-blue", name: "Midnight Blue", room: "The Mysterious Room", mood: "Cool, calm, exclusive.",
    bg: "#080D1A", surface: "#111A2B", accent: "#8BA9FF", accent2: "#5EEAD4", text: "#E8EEFC", muted: "#9CA9C4",
    accentRgb: "139,169,255", accent2Rgb: "94,234,212" },
  { id: "velvet-burgundy", name: "Velvet Burgundy", room: "The Seductive Room", mood: "Intimate, sensual, elegant.",
    bg: "#14080F", surface: "#24101C", accent: "#F06A8B", accent2: "#D8A0B5", text: "#F8E9EF", muted: "#C29AAB",
    accentRgb: "240,106,139", accent2Rgb: "216,160,181" },
  { id: "dark-plum", name: "Dark Plum", room: "The Secret Room", mood: "Enigmatic, dreamy, private.",
    bg: "#100A18", surface: "#20142B", accent: "#C5A3FF", accent2: "#F0A6D5", text: "#F1EAFB", muted: "#AE9DC4",
    accentRgb: "197,163,255", accent2Rgb: "240,166,213" },
  { id: "obsidian-gold", name: "Obsidian Gold", room: "The Luxury Room", mood: "Expensive, confident, refined.",
    bg: "#0C0C0D", surface: "#191817", accent: "#D6B56D", accent2: "#F0D9A0", text: "#F5F0E6", muted: "#ABA391",
    accentRgb: "214,181,109", accent2Rgb: "240,217,160" },
  { id: "smoky-emerald", name: "Smoky Emerald", room: "The Enchanted Room", mood: "Calm, intriguing, quietly seductive.",
    bg: "#07130F", surface: "#10231B", accent: "#65D6A6", accent2: "#C4E7B5", text: "#E7F5EE", muted: "#93B5A5",
    accentRgb: "101,214,166", accent2Rgb: "196,231,181" },
  { id: "obsidian-rose", name: "Obsidian Rose", room: "The Intimate Room", mood: "Warm, playful, affectionate.",
    bg: "#130A10", surface: "#24131D", accent: "#FF8FAF", accent2: "#F5C6D6", text: "#FBEDF2", muted: "#C6A0B0",
    accentRgb: "255,143,175", accent2Rgb: "245,198,214" },
  { id: "arctic-silver", name: "Arctic Silver", room: "The Cool Room", mood: "Minimal, composed, effortlessly cool.",
    bg: "#0B1015", surface: "#171F27", accent: "#C3D3E3", accent2: "#83B8D9", text: "#EDF2F7", muted: "#9AA8B6",
    accentRgb: "195,211,227", accent2Rgb: "131,184,217" },
  { id: "deep-ocean", name: "Deep Ocean", room: "The After-Dark Room", mood: "Nocturnal, immersive, cinematic.",
    bg: "#061117", surface: "#0E2028", accent: "#55C7D9", accent2: "#7C9EFF", text: "#E4F3F7", muted: "#8FB0BA",
    accentRgb: "85,199,217", accent2Rgb: "124,158,255" },
  { id: "ember", name: "Ember", room: "The Passion Room", mood: "Warm, bold, energetic.",
    bg: "#170B07", surface: "#29140E", accent: "#FF9B62", accent2: "#FFD09B", text: "#FCEEE6", muted: "#C7A491",
    accentRgb: "255,155,98", accent2Rgb: "255,208,155" },
  { id: "pure-noir", name: "Pure Noir", room: "The Minimalist Room", mood: "Timeless, discreet, understated.",
    bg: "#080808", surface: "#151515", accent: "#E7E7E7", accent2: "#929292", text: "#F2F2F2", muted: "#A3A3A3",
    accentRgb: "231,231,231", accent2Rgb: "146,146,146" },
];

export const DEFAULT_ROOM_THEME = "midnight-blue";

export function roomThemeById(id?: string | null): RoomTheme {
  return ROOM_THEMES.find((t) => t.id === id) || ROOM_THEMES[0];
}

/** The custom properties a themed Room (or a miniature of one) reads. */
export function roomThemeVars(id?: string | null): CSSProperties {
  const t = roomThemeById(id);
  return {
    "--rt-bg": t.bg,
    "--rt-surface": t.surface,
    "--rt-accent": t.accent,
    "--rt-accent2": t.accent2,
    "--rt-text": t.text,
    "--rt-muted": t.muted,
    "--rt-border": `rgba(${t.accentRgb}, 0.16)`,
    "--rt-border-strong": `rgba(${t.accentRgb}, 0.34)`,
    "--rt-glow": `rgba(${t.accentRgb}, 0.22)`,
    "--rt-glow2": `rgba(${t.accent2Rgb}, 0.12)`,
    "--rt-tint": `rgba(${t.accentRgb}, 0.1)`,
  } as CSSProperties;
}

export const ROOM_STATUSES: { id: string; label: string }[] = [
  { id: "open", label: "Open to knocks" },
  { id: "late", label: "Up late" },
  { id: "quiet", label: "Quiet tonight" },
  { id: "away", label: "Away for now" },
];

export const statusLabel = (id?: string | null) => ROOM_STATUSES.find((s) => s.id === id)?.label || null;

export const GALLERY_VISIBILITY: { id: string; label: string; hint: string }[] = [
  { id: "window", label: "Everyone peeking", hint: "Shown through your window before anyone knocks." },
  { id: "inside", label: "Only people I let in", hint: "Visitors see that you have photos, not the photos." },
  { id: "only_me", label: "Only me", hint: "Kept private. Letting someone in doesn't change this." },
];

/** Openers shown after a Let In. Tapping one only fills the box; nothing is sent for you. */
export const STARTERS = [
  "Your Room said more than your post did.",
  "Okay, I'm in. Now what?",
  "I've been curious since I saw your post.",
  "Tell me the part you didn't write.",
];

export const MAX_INTRO = 160;
export const MAX_WELCOME = 280;
