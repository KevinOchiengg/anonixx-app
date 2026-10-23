import { ImageResponse } from "next/og";

// The 1200×630 share card: the site default (/og) and text-only drops (/og/drop/[id]).
export const OG_SIZE = { width: 1200, height: 630 };

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
