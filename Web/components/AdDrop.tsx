"use client";
// A feed ad that scrolls like a drop: full-screen media, an "Ad" label, the caption, one button.
// Taps go through /ads/{id}/go so they're counted; views, likes and hides are counted too.
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { EyeOff, Heart, Megaphone } from "lucide-react";
import { api, API_URL, getDeviceId, type FeedAd } from "@/lib/api";
import { splitHook } from "@/lib/captionHook";

function href(ad: FeedAd): { url: string; internal: boolean } {
  const drop = ad.link_url.match(/^anonixx:\/\/drop\/([\w-]+)/);
  if (drop) return { url: `/drop/${drop[1]}`, internal: true };
  const room = ad.link_url.match(/^anonixx:\/\/room\/([\w-]+)/);
  if (room) return { url: `/room/${room[1]}`, internal: true };
  return { url: `${API_URL}/ads/${ad.id}/go?v=${encodeURIComponent(getDeviceId())}`, internal: false };
}

const track = (id: string, type: string) => api(`/ads/${id}/event`, { body: { type } }).catch(() => {});

export default function AdDrop({ ad, index, isActive, onHide }: { ad: FeedAd; index: number; isActive: boolean; onHide: (id: string) => void }) {
  const [liked, setLiked] = useState(false);
  const counted = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const link = href(ad);
  const parts = splitHook(ad.title);

  useEffect(() => {
    if (isActive && !counted.current) { counted.current = true; track(ad.id, "seen"); }
    const v = video.current;
    if (!v) return;
    if (isActive) v.play().catch(() => {}); else v.pause();
  }, [isActive, ad.id]);

  function like() {
    setLiked((was) => { track(ad.id, was ? "unlike" : "like"); return !was; });
  }

  const cover = ad.media_type === "video" ? ad.cover_url : ad.media_url;
  return (
    <section className="slide ad-drop" aria-label="Ad" data-idx={index}>
      {ad.media_type === "video" && ad.media_url ? (
        <video ref={video} className="ad-media" src={ad.media_url} poster={ad.cover_url || undefined} muted loop playsInline preload="metadata" />
      ) : cover ? (
        <Image className="ad-media" src={cover} alt="" fill sizes="100vw" />
      ) : <div className="ad-media ad-plain" />}
      <span className="ad-tag"><Megaphone strokeWidth={2} aria-hidden />Ad</span>
      <div className="ad-rail">
        <button type="button" className={liked ? "on" : ""} onClick={like} aria-pressed={liked} aria-label="Like">
          <Heart strokeWidth={2} fill={liked ? "currentColor" : "none"} aria-hidden />
        </button>
        <button type="button" onClick={() => { track(ad.id, "hide"); onHide(ad.id); }} aria-label="Not interested">
          <EyeOff strokeWidth={2} aria-hidden />
        </button>
      </div>
      <div className="ad-foot">
        <p className="ad-cap">
          {parts ? <><span className="cap-hook">{parts.hook}</span>{parts.rest}</> : ad.title}
        </p>
        <a className="ad-btn" href={link.url} {...(link.internal ? { onClick: () => track(ad.id, "tap") } : { target: "_blank", rel: "noopener noreferrer sponsored" })}>
          {ad.cta || "Check it out"}
        </a>
      </div>
    </section>
  );
}
