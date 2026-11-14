"use client";
/** Rooms → My Room: your Room as visitors see it, the welcome you've set up (note, audio,
 * three media) and quick ways to change it. Editing happens in /chat-setup. */
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FONTS_HREF, fontStyleById } from "@/lib/chatTheme";
import { roomThemeById, roomThemeVars } from "@/lib/roomThemes";

type Me = {
  anonymous_name?: string; profile_picture_url?: string | null; room_theme?: string; font_style?: string;
  welcome_message?: string | null;
  welcome_visibility?: string;
};

export default function MyRoomPanel() {
  const { user } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { api<Me>("/chat-profile/me").then(setMe).catch(() => setMe({})); }, []);
  if (!me) return <p className="muted center">Loading…</p>;

  const t = roomThemeById(me.room_theme);
  const name = me.anonymous_name || "Your Room";
  const steps = [
    { done: !!me.welcome_message, label: "Welcome note", hint: me.welcome_message ? `“${me.welcome_message}”` : "The first thing someone reads when you let them in." },
  ];

  return (
    <div className="mr">
      <link rel="stylesheet" href={FONTS_HREF} precedence="default" />
      <section className="mr-hero" style={roomThemeVars(me.room_theme)}>
        <small className="mr-kicker">{t.room}</small>
        <span className="mr-ava"><span>{me.profile_picture_url ? <Image src={me.profile_picture_url} alt="" width={86} height={86} /> : name[0].toUpperCase()}</span></span>
        <b className="mr-name" style={fontStyleById(me.font_style)}>{name}</b>
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
