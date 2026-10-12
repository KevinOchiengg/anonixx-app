import type { CSSProperties } from "react";

type Overlay =
  | { kind: "none" }
  | { kind: "dots" | "lines" | "grid" | "noise" | "glow"; color: string; size?: number; cross?: boolean };

export type Pattern = { id: string; label: string; gradient: [string, string]; overlay: Overlay };

export const PATTERNS: Pattern[] = [
  { id: "midnight-solid", label: "Midnight", gradient: ["#151924", "#0b0e16"], overlay: { kind: "none" } },
  { id: "velvet-dots", label: "Velvet", gradient: ["#2a0f1e", "#12060d"], overlay: { kind: "dots", color: "rgba(255,182,193,0.35)", size: 26 } },
  { id: "smoke-lines", label: "Smoke", gradient: ["#221a2e", "#0e0a16"], overlay: { kind: "lines", color: "rgba(255,255,255,0.06)", size: 36 } },
  { id: "ember-glow", label: "Ember", gradient: ["#2e1408", "#140803"], overlay: { kind: "glow", color: "rgba(255,99,74,0.28)" } },
  { id: "obsidian-grid", label: "Obsidian", gradient: ["#0e0e12", "#050506"], overlay: { kind: "grid", color: "rgba(255,255,255,0.05)", size: 28 } },
  { id: "rose-noise", label: "Rose", gradient: ["#33101c", "#160810"], overlay: { kind: "noise", color: "rgba(255,120,150,0.18)", size: 7 } },
  { id: "eclipse-mesh", label: "Eclipse", gradient: ["#1a1030", "#080513"], overlay: { kind: "lines", color: "rgba(180,150,255,0.10)", size: 26, cross: true } },
  { id: "static-haze", label: "Haze", gradient: ["#1c1c1e", "#0a0a0b"], overlay: { kind: "noise", color: "rgba(255,255,255,0.10)", size: 9 } },
  { id: "crimson-fade", label: "Crimson", gradient: ["#3a0a14", "#0d0305"], overlay: { kind: "none" } },
  { id: "ink-bloom", label: "Ink Bloom", gradient: ["#0c0c18", "#030307"], overlay: { kind: "glow", color: "rgba(120,90,255,0.22)" } },
];

export const DEFAULT_PATTERN = "midnight-solid";

export const FONTS: { id: string; label: string; family: string; weight?: number; style?: string }[] = [
  { id: "clean-regular", label: "Clean", family: "'DM Sans', system-ui, sans-serif", weight: 400 },
  { id: "soft-medium", label: "Soft", family: "'DM Sans', system-ui, sans-serif", weight: 500 },
  { id: "confident-semibold", label: "Confident", family: "'DM Sans', system-ui, sans-serif", weight: 600 },
  { id: "bold-statement", label: "Bold", family: "'Montserrat', system-ui, sans-serif", weight: 800 },
  { id: "elegant-serif", label: "Elegant", family: "'Fraunces', Georgia, serif", weight: 400 },
  { id: "elegant-italic", label: "Refined", family: "'Fraunces', Georgia, serif", weight: 400, style: "italic" },
  { id: "playful-script", label: "Playful", family: "'Dancing Script', cursive", weight: 400 },
  { id: "whisper-italic", label: "Whisper", family: "'DM Sans', system-ui, sans-serif", weight: 400, style: "italic" },
];

export const DEFAULT_FONT = "clean-regular";

export const SOUNDS = [
  { id: "soft-chime", label: "Soft Chime" },
  { id: "warm-bell", label: "Warm Bell" },
  { id: "gentle-hum", label: "Gentle Hum" },
  { id: "silence", label: "No sound" },
];

export const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Dancing+Script&family=Fraunces:ital@0;1&family=Montserrat:wght@800&display=swap";

export function patternById(id?: string | null): Pattern {
  return PATTERNS.find((p) => p.id === id) || PATTERNS[0];
}

export function fontStyleById(id?: string | null): CSSProperties {
  const f = FONTS.find((x) => x.id === id) || FONTS[0];
  return { fontFamily: f.family, fontWeight: f.weight, fontStyle: f.style || "normal" };
}

function overlayStyle(o: Overlay): CSSProperties {
  if (o.kind === "none") return {};
  const c = o.color;
  const s = o.size || 24;
  switch (o.kind) {
    case "dots":
      return { backgroundImage: `radial-gradient(circle, ${c} 1.5px, transparent 2px)`, backgroundSize: `${s}px ${s}px` };
    case "noise":
      return {
        backgroundImage: `radial-gradient(circle, ${c} 1px, transparent 1.5px), radial-gradient(circle, ${c} 1px, transparent 1.5px)`,
        backgroundSize: `${s * 2.3}px ${s * 1.7}px, ${s * 3.1}px ${s * 2.9}px`,
        backgroundPosition: "0 0, 11px 17px",
      };
    case "lines": {
      const a = `repeating-linear-gradient(135deg, transparent 0 ${s - 1}px, ${c} ${s - 1}px ${s}px)`;
      const b = `repeating-linear-gradient(45deg, transparent 0 ${s - 1}px, ${c} ${s - 1}px ${s}px)`;
      return { backgroundImage: o.cross ? `${a}, ${b}` : a };
    }
    case "grid":
      return {
        backgroundImage: `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`,
        backgroundSize: `${s}px ${s}px`,
      };
    case "glow":
      return { backgroundImage: `radial-gradient(circle at 50% 28%, ${c}, transparent 62%)` };
  }
}

export function ChatBackground({ id, className = "u-bg" }: { id?: string | null; className?: string }) {
  const p = patternById(id);
  return (
    <div className={className} aria-hidden style={{ background: `linear-gradient(180deg, ${p.gradient[0]}, ${p.gradient[1]})` }}>
      <div style={{ position: "absolute", inset: 0, ...overlayStyle(p.overlay) }} />
    </div>
  );
}

export type GalleryItem = { media_url: string; media_type: string; duration_seconds?: number | null };
