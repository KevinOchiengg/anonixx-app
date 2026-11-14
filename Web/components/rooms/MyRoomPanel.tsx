"use client";
/** Rooms → My Room: your Room as visitors see it, the welcome you've set up (note, audio,
 * three media) and quick ways to change it. Editing happens in /chat-setup. */
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FONTS_HREF, fontStyleById, type GalleryItem } from "@/lib/chatTheme";
import { roomThemeById, roomThemeVars, statusLabel } from "@/lib/roomThemes";

type Me = {
  anonymous_name?: string; profile_picture_url?: string | null; room_theme?: string; font_style?: string;
  room_status?: string | null; intro?: string | null; welcome_message?: string | null; gallery?: GalleryItem[];
  gallery_visibility?: string;
  welcome_visibility?: string;
};

export default function MyRoomPanel() {
  const { user } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { api<Me>("/chat-profile/me").then(setMe).catch(() => setMe({})); }, []);
  if (!me) return <p className="muted center">Loading…</p>;

  const t = roomThemeById(me.room_theme);
  const name = me.anonymous_name || "Your Room";
  const status = statusLabel(me.room_status);
  const gallery = me.gallery || [];
  const steps = [
    { done: !!me.welcome_message, label: "Welcome note", hint: me.welcome_message ? `“${me.welcome_message}”` : "The first thing someone reads when you let them in." },
    { done: gallery.length > 0, label: `Welcome media ${gallery.length}/3`, hint: gallery.length ? (me.gallery_visibility === "inside" ? "Only people inside see them." : me.gallery_visibility === "only_me" ? "Hidden from everyone." : "Everyone peeking sees them.") : "Photos or short videos for your walls." },
  ];

  return (
    <div className="mr">
      <link rel="stylesheet" href={FONTS_HREF} precedence="default" />
      <section className="mr-hero" style={roomThemeVars(me.room_theme)}>
        <small className="mr-kicker">{t.room}</small>
        <span className="mr-ava"><span>{me.profile_picture_url ? <Image src={me.profile_picture_url} alt="" width={86} height={86} /> : name[0].toUpperCase()}</span></span>
        <b className="mr-name" style={fontStyleById(me.font_style)}>{name}</b>
        {status ? <span className="mr-status">{status}</span> : null}
        <p className="mr-intro" style={fontStyleById(me.font_style)}>{me.intro || "No intro yet. It’s the first thing they read."}</p>
        <div className="mr-slots">
          {[0, 1, 2].map((i) => {
            const g = gallery[i];
            return (
              <Link key={i} href="/chat-setup?tab=welcome" className="mr-slot" aria-label={g ? `Welcome media ${i + 1}` : `Add welcome media ${i + 1}`}>
                {g ? (g.media_type === "video" ? <video src={g.media_url} muted playsInline preload="metadata" /> : <Image src={g.media_url} alt="" width={120} height={160} />) : <span>+</span>}
              </Link>
            );
          })}
        </div>
        <div className="mr-acts">
          {user?.id ? <Link href={`/room/${user.id}`} className="mr-btn">See it as a visitor</Link> : null}
          <Link href="/chat-setup?tab=appearance" className="mr-btn accent">Personalize</Link>
        </div>
      </section>

      <p className="lv-label">Your welcome</p>
      <div className="mr-steps">
        {steps.map((s) => (
          <Link key={s.label} href="/chat-setup?tab=welcome" className="mr-step">
            <i className={s.done ? "on" : ""} aria-hidden>{s.done ? "✓" : ""}</i>
            <span><b>{s.label}</b><small>{s.hint}</small></span>
          </Link>
        ))}
      </div>
      <Link href="/chat-setup?tab=welcome" className="u-cta mr-cta">{steps.every((s) => s.done) ? "Edit your welcome" : "Set up your welcome"}</Link>
      <p className="rs-info">
        {me.welcome_visibility === "window" ? "Anyone peeking reads your welcome note." : "Only people you let in see this."} Change who sees what in{" "}
        <Link href="/chat-setup?tab=privacy">Privacy</Link>.
      </p>
    </div>
  );
}
