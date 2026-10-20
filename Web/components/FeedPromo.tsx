"use client";
import Image from "next/image";
import Link from "next/link";
import type { FeedAd, MarketTease } from "@/lib/api";
import { ChevronRight, ExternalLink, Lock, Megaphone } from "./feedicons";

export function AdSlide({ ad, index }: { ad: FeedAd; index: number }) {
  return (
    <section className="slide promo-slide" aria-label="Advertisement" data-idx={index}>
      <div className="promo-center">
        <a className="fad-card" href={ad.link_url} target="_blank" rel="noopener noreferrer sponsored">
          <span className="fad-badge"><Megaphone />{ad.ad_type === "house" ? "Anonixx" : "Sponsored"}</span>
          {ad.media_url && ad.media_type === "video" ? (
            <video className="fad-cover" src={ad.media_url} autoPlay muted loop playsInline />
          ) : ad.media_url && ad.media_type === "audio" ? (
            <span className="fad-audio">♪ Audio</span>
          ) : ad.media_url ? (
            <Image className="fad-cover" src={ad.media_url} alt="" width={1080} height={1350} sizes="100vw" />
          ) : null}
          <span className="fad-title">{ad.title}</span>
        </a>
        <a className="ad-cta" href={ad.link_url} target="_blank" rel="noopener noreferrer sponsored">
          <ExternalLink />Learn more
        </a>
      </div>
    </section>
  );
}

export function MarketSlide({ item, index }: { item: MarketTease; index: number }) {
  return (
    <section className="slide promo-slide" aria-label="Anonixx Market" data-idx={index}>
      <div className="promo-center">
        <Link href={`/market/${item.id}`} className="mk-card">
          <span className="mk-top">
            <span className="mk-badge"><i />EXCLUSIVE</span>
            <span className="mk-label">Anonixx Intel</span>
          </span>
          {item.media_url ? (
            <Image className="mk-cover" src={item.media_url} alt="" width={1080} height={1350} sizes="100vw" />
          ) : null}
          <span className="mk-title">{item.title}</span>
          <span className="mk-teaser">{item.teaser}</span>
          <span className="mk-faux" aria-hidden><i style={{ width: "92%", opacity: 0.18 }} /><i style={{ width: "78%", opacity: 0.13 }} /><i style={{ width: "60%", opacity: 0.08 }} /></span>
          <span className="mk-cta"><Lock />Unlock for {item.price_coins} coins<ChevronRight /></span>
        </Link>
      </div>
    </section>
  );
}
