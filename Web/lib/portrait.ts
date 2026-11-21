export type Shape =
  | { t: "path"; d: string; fill: string }
  | { t: "ellipse"; cx: number; cy: number; rx: number; ry: number; fill: string }
  | { t: "circle"; cx: number; cy: number; r: number; fill: string };

export type Portrait = { bg: string; glow: string; shapes: Shape[]; label: string };

export const PORTRAIT_VIEWBOX = "9 11 82 82";

type Style = "long" | "bun" | "quiff" | "crop" | "shag" | "hood";

const SKINS = ["#F3C9AE", "#E0A47C", "#B97852", "#8A5638", "#5E3A26"];
const HAIRS = ["#1D1626", "#3B2357", "#5A2E1E", "#2B2B33", "#D9B58C"];
const SHIRTS = ["#FF634A", "#B36BFF", "#FBBF24", "#FF7AB8", "#3FC1A5"];

const STYLES: Record<string, Style[]> = {
  female: ["long", "bun"],
  male: ["quiff", "crop"],
  nonbinary: ["shag"],
};

const LABELS: Record<string, string> = { female: "Female", male: "Male", nonbinary: "Non-binary" };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, "0")).join("")}`;
}

const BODY = "M14 100 C14 80 30 72 50 72 C70 72 86 80 86 100 Z";
const NECK = "M42 56 H58 V72 C58 77 42 77 42 72 Z";

const HAIR: Record<Style, { back?: string; front?: string; bun?: boolean }> = {
  long: {
    back: "M33 46 C31 26 40 21 50 21 C61 21 69 27 67 46 L70 82 C62 80 58 74 58 66 H42 C42 74 38 80 30 82 Z",
    front: "M35 44 C35 30 42 25 51 25 C60 25 66 31 65 42 C58 40 51 34 47 30 C44 37 40 41 35 44 Z",
  },
  bun: {
    back: "M34 46 C32 30 40 25 50 25 C60 25 68 30 66 46 V56 C63 56 62 52 62 48 H38 C38 52 37 56 34 56 Z",
    front: "M35 42 C36 31 43 27 50 27 C58 27 64 31 65 42 C59 37 53 33 50 32 C46 35 41 39 35 42 Z",
    bun: true,
  },
  quiff: {
    front: "M35 42 C33 30 38 22 47 20 C52 15 62 16 64 24 C67 28 66 36 65 42 C62 36 57 33 50 33 C43 33 38 36 35 42 Z",
  },
  crop: {
    front: "M35 41 C34 29 41 24 50 24 C59 24 66 29 65 41 C61 35 56 32 50 32 C44 32 39 35 35 41 Z",
  },
  shag: {
    back: "M34 50 C32 30 40 24 50 24 C60 24 68 30 66 50 C64 54 62 56 60 56 H40 C38 56 36 54 34 50 Z",
    front: "M35 42 C35 31 42 26 50 26 C58 26 65 31 65 42 C60 38 56 36 53 32 C50 37 42 40 35 42 Z",
  },
  hood: {
    back: "M29 52 C27 28 38 17 50 17 C62 17 73 28 71 52 L74 80 H26 Z",
    front: "M33 54 C31 36 39 27 50 27 C61 27 69 36 67 54 C66 41 60 32 50 32 C40 32 34 41 33 54 Z",
  },
};

export function portraitFor(seed: string, gender?: string | null): Portrait {
  const key = seed || "anon";
  const pick = <T,>(list: T[], salt: string) => list[hash(`${key}:${salt}`) % list.length];
  const styles = (gender && STYLES[gender]) || null;
  const style: Style = styles ? pick(styles, "style") : "hood";
  const skin = pick(SKINS, "skin");
  const hair = pick(HAIRS, "hair");
  const shirt = pick(SHIRTS, "shirt");
  const art = HAIR[style];
  const hairFill = style === "hood" ? shade(shirt, 0.55) : hair;

  const shapes: Shape[] = [];
  if (art.bun) shapes.push({ t: "circle", cx: 50, cy: 21, r: 8, fill: hairFill });
  if (art.back) shapes.push({ t: "path", d: art.back, fill: hairFill });
  shapes.push({ t: "path", d: BODY, fill: style === "hood" ? shade(shirt, 0.75) : shirt });
  shapes.push({ t: "ellipse", cx: 50, cy: 73, rx: 10, ry: 4.5, fill: shade(skin, 0.85) });
  shapes.push({ t: "path", d: NECK, fill: shade(skin, 0.85) });
  if (style === "quiff" || style === "crop") {
    shapes.push({ t: "ellipse", cx: 35, cy: 46, rx: 3, ry: 4.5, fill: shade(skin, 0.92) });
    shapes.push({ t: "ellipse", cx: 65, cy: 46, rx: 3, ry: 4.5, fill: shade(skin, 0.92) });
  }
  shapes.push({ t: "ellipse", cx: 50, cy: 44, rx: 15, ry: 17, fill: skin });
  if (art.front) shapes.push({ t: "path", d: art.front, fill: hairFill });

  return {
    bg: "#15101B",
    glow: shade(shirt, 0.42),
    shapes,
    label: (gender && LABELS[gender]) || "Anonymous",
  };
}
