"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
const SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT;

declare global {
  interface Window { adsbygoogle?: unknown[] }
}

// AdSense when configured; otherwise an Anonixx promo so the slot is never empty.
export default function AdSlot({ index }: { index: number }) {
  const pushed = useRef(false);

  useEffect(() => {
    if (!CLIENT || !SLOT || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch { /* blocked or not loaded yet */ }
  }, []);

  return (
    <section className={`slide g${index % 6}`} aria-label="Advertisement" data-idx={index} style={{ padding: 24 }}>
      <div className="ad-label">Sponsored</div>
      {CLIENT && SLOT ? (
        <div className="ad-box">
          <ins
            className="adsbygoogle"
            style={{ display: "block", width: "100%" }}
            data-ad-client={CLIENT}
            data-ad-slot={SLOT}
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        </div>
      ) : (
        <div>
          <p className="confession">somebody out there is waiting for a message like yours.</p>
          <div className="byline">Write it. Stay hidden. Link up only if you both want to.</div>
          <div style={{ marginTop: 22 }}>
            <Link href="/join" className="pill">Get Anonixx</Link>
          </div>
        </div>
      )}
    </section>
  );
}
