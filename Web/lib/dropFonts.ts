import type { CSSProperties } from "react";

/** Fonts a poster can pick for a text drop. Ids match FONT_STYLES in Backend drops.py and
 * CARD_FONT_STYLES in the app's DropCardRenderer.jsx. Families load from DROP_FONTS_HREF. */
export const DROP_FONTS = [
  { id: "classic", label: "Classic", family: "var(--font-serif), 'Fraunces', Georgia, serif", weight: 500, style: "italic" },
  { id: "sultry-script", label: "Sultry", family: "'Dancing Script', cursive", weight: 400, style: "normal" },
  { id: "bold-tease", label: "Bold", family: "'Montserrat', system-ui, sans-serif", weight: 800, style: "normal" },
  { id: "clean", label: "Clean", family: "'DM Sans', system-ui, sans-serif", weight: 600, style: "normal" },
  { id: "elegant", label: "Elegant", family: "'Fraunces', Georgia, serif", weight: 400, style: "normal" },
] as const;

export const DEFAULT_DROP_FONT = "classic";

export const DROP_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=DM+Sans:wght@600&family=Dancing+Script&family=Fraunces&family=Montserrat:wght@800&display=swap";

/** Inline style for a drop's font, or undefined to keep the default look. */
export function dropFontStyle(id?: string | null): CSSProperties | undefined {
  const f = DROP_FONTS.find((x) => x.id === id);
  return f ? { fontFamily: f.family, fontWeight: f.weight, fontStyle: f.style } : undefined;
}
