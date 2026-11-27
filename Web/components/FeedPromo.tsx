"use client";
import Image from "next/image";
import Link from "next/link";
import type { MarketTease } from "@/lib/api";
import { ChevronRight, Lock } from "./feedicons";
import AuthorAvatar from "./AuthorAvatar";
import { startsLabel, type LiveCard } from "@/lib/lives";

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

export function LiveSlide({ live, index }: { live: LiveCard; index: number }) {
  const on = live.status === "live";
  return (
    <section className="slide promo-slide" aria-label="Promoted live" data-idx={index}>
      <div className="promo-center">
        <Link href={`/lives/${live.id}`} className="lvp-card">
          <span className="lvp-media">
            {live.cover_url ? <Image src={live.cover_url} alt="" fill sizes="100vw" /> : (
              <span className="lvp-ava"><AuthorAvatar src={live.host.avatar_url} seed={live.host.id} name={live.host.name} gender={live.host.gender} size={96} /></span>
            )}
            <span className={`lvp-badge${on ? " on" : ""}`}>{on ? "LIVE NOW" : `Starts ${startsLabel(live.starts_at)}`}</span>
          </span>
          <span className="lvp-host">{live.host.name || "Anonymous"} · Promoted</span>
          <span className="lvp-title">{live.title}</span>
          <span className="lvp-cta">{on ? "Watch free preview" : "See the live"}<ChevronRight /></span>
        </Link>
      </div>
    </section>
  );
}
