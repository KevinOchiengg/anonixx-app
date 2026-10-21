import type { VideoOverlay } from "./videoEdit";

const W = 720;
const H = 1280;
const SIZE = { s: 0.046, m: 0.064, l: 0.088 } as const;

// One frame of the clip, framed like the feed's 9:16 player (portrait fills it, landscape
// is letterboxed), with the text overlays drawn on top: the poster and share preview then
// match what people actually see. Works on local blob: URLs, so it runs before upload.
export async function captureCover(src: string, time: number, overlays: VideoOverlay[]): Promise<Blob> {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = src;
  await new Promise<void>((ok, fail) => {
    v.onloadeddata = () => ok();
    v.onerror = () => fail(new Error("Couldn't read the video to make a cover."));
  });
  await new Promise<void>((ok) => {
    v.onseeked = () => ok();
    v.currentTime = Math.min(Math.max(0, time), Math.max(0, v.duration - 0.05));
  });

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const landscape = v.videoWidth > v.videoHeight * 1.05;
  const scale = landscape ? Math.min(W / v.videoWidth, H / v.videoHeight) : Math.max(W / v.videoWidth, H / v.videoHeight);
  const dw = v.videoWidth * scale;
  const dh = v.videoHeight * scale;
  ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
  v.removeAttribute("src");
  v.load();

  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  for (const o of overlays) if (o.text.trim()) drawOverlay(ctx, o, family);

  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("Couldn't make the cover image."))), "image/jpeg", 0.86));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= max || !line) line = next;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

function drawOverlay(ctx: CanvasRenderingContext2D, o: VideoOverlay, family: string) {
  const fs = W * SIZE[o.size];
  ctx.font = `800 ${fs}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const boxed = o.style !== "shadow";
  const padX = boxed ? fs * 0.55 : 0;
  const padY = boxed ? fs * 0.22 : 0;
  const lineH = fs * 1.22;
  const lines = wrap(ctx, o.text.trim(), W * 0.86 - padX * 2);
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const bw = textW + padX * 2;
  const bh = lines.length * lineH + padY * 2;
  const cx = o.x * W;
  const cy = o.y * H;

  if (boxed) {
    ctx.fillStyle = o.style === "coral" ? "#ff634a" : "rgba(10,12,20,0.62)";
    ctx.beginPath();
    ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, fs * 0.38);
    ctx.fill();
  } else {
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = fs * 0.4;
    ctx.shadowOffsetY = 1;
  }
  ctx.fillStyle = "#fff";
  lines.forEach((l, i) => ctx.fillText(l, cx, cy - bh / 2 + padY + lineH * (i + 0.5)));
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}
