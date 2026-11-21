import { ImageResponse } from "next/og";
import sharp from "sharp";

// The 1200×630 share card: the site default (/og) and per-drop cards (/og/drop/[id]).
export const OG_SIZE = { width: 1200, height: 630 };

export const BLUR = { media: 30, text: 15 } as const;

export function ogCard(quote: string | null) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: "72px 80px", background: "linear-gradient(160deg, #151924 0%, #0b0f18 60%, #070a11 100%)", color: "#EAEAF0",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, letterSpacing: 6, color: "#FF634A", fontWeight: 700 }}>ANONIXX</div>
        {quote ? (
          <div style={{ display: "flex", fontSize: quote.length > 110 ? 48 : 60, lineHeight: 1.25, fontStyle: "italic" }}>
            “{quote}”
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>Say what you can&apos;t say</div>
            <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.1, color: "#FF634A", fontStyle: "italic" }}>out loud.</div>
          </div>
        )}
        <div style={{ display: "flex", fontSize: 28, color: "#9A9AA3" }}>
          {quote ? "Someone confessed this on Anonixx. No name. No trace." : "Anonymous confessions. Link up only if you both want to."}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}

async function blurred(source: Buffer, sigma: number): Promise<string> {
  const png = await sharp(source)
    .resize(OG_SIZE.width, OG_SIZE.height, { fit: "cover" })
    .blur(sigma)
    .modulate({ brightness: 0.75 })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** A drop's share card: its media or text, blurred beyond reading, with an invitation to open it. */
export async function blurredDropCard(source: Buffer, sigma: number = BLUR.media) {
  const background = await blurred(source, sigma);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", color: "#fff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={background} width={OG_SIZE.width} height={OG_SIZE.height} alt="" style={{ position: "absolute", top: 0, left: 0 }} />
        <div
          style={{
            position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "radial-gradient(circle at 50% 50%, rgba(11,15,24,0.15) 0%, rgba(11,15,24,0.65) 75%)",
          }}
        >
          <div style={{ display: "flex", fontSize: 30, letterSpacing: 8, color: "#FF634A", fontWeight: 700 }}>ANONIXX</div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 64, fontWeight: 700 }}>Someone confessed something</div>
          <div
            style={{
              display: "flex", marginTop: 34, padding: "16px 36px", borderRadius: 999,
              background: "#FF634A", fontSize: 30, fontWeight: 700,
            }}
          >
            Tap to see it on Anonixx
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
