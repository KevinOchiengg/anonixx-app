"use client";
import { useState } from "react";

/**
 * What a host sees on a Knock before opening the door: signals about the
 * knocker (free to give, hard to fake), their peek and photo/video (blurred
 * until the host taps, so nothing explicit lands unasked), and a voice note.
 * Fields come from GET /unlock-requests/incoming.
 */
export type KnockSignals = {
  account_age_days: number | null; verified: boolean; let_in: number; knocks_decided: number;
  drops: number; deception_strikes: number; likes_you: boolean; you_like_them: boolean;
};
export type KnockClue = {
  signals?: KnockSignals;
  peek?: { media_url: string; media_type: string }[];
  media_url?: string | null;
  media_type?: string | null;
  voice_url?: string | null;
  voice_duration?: number | null;
};

const age = (d: number | null) =>
  d == null ? null : d < 7 ? `new here (${d || "<1"} day${d === 1 ? "" : "s"})` : d < 60 ? `${Math.floor(d / 7)} weeks on Anonixx` : d < 730 ? `${Math.floor(d / 30)} months on Anonixx` : `${Math.floor(d / 365)} years on Anonixx`;

export function signalChips(s?: KnockSignals): { text: string; tone?: "good" | "bad" }[] {
  if (!s) return [];
  const out: { text: string; tone?: "good" | "bad" }[] = [];
  if (s.deception_strikes) out.push({ text: `${s.deception_strikes} confirmed deception report${s.deception_strikes === 1 ? "" : "s"}`, tone: "bad" });
  if (s.likes_you && s.you_like_them) out.push({ text: "you like each other's drops", tone: "good" });
  else if (s.likes_you) out.push({ text: "likes your drops", tone: "good" });
  else if (s.you_like_them) out.push({ text: "you liked their drops" });
  if (s.knocks_decided) out.push({ text: `let in by ${s.let_in} of ${s.knocks_decided} hosts`, tone: s.let_in / s.knocks_decided >= 0.5 ? "good" : undefined });
  else out.push({ text: "first knock" });
  if (s.verified) out.push({ text: "verified", tone: "good" });
  const a = age(s.account_age_days);
  if (a) out.push({ text: a });
  out.push({ text: s.drops ? `${s.drops} drop${s.drops === 1 ? "" : "s"}` : "no drops yet" });
  return out;
}

export default function KnockClues({ k, compact = false }: { k: KnockClue; compact?: boolean }) {
  const [shown, setShown] = useState<Set<string>>(new Set());
  const items = [
    ...(k.peek || []).map((p) => ({ ...p, from: "room" as const })),
    ...(k.media_url ? [{ media_url: k.media_url, media_type: k.media_type || "image", from: "knock" as const }] : []),
  ];
  const chips = signalChips(k.signals);
  const reveal = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    setShown((cur) => new Set(cur).add(url));
  };

  return (
    <span className={`kc${compact ? " compact" : ""}`} onClick={(e) => e.stopPropagation()}>
      {chips.length ? (
        <span className="kc-sig">
          {chips.map((c) => <i key={c.text} className={c.tone || ""}>{c.text}</i>)}
        </span>
      ) : null}
      {items.length ? (
        <span className="kc-tiles">
          {items.map((it) => {
            const open = shown.has(it.media_url);
            return (
              <span key={it.media_url} className={`kc-tile${open ? " open" : ""}`}>
                {it.media_type === "video"
                  ? <video src={it.media_url} muted={!open} controls={open} playsInline preload="metadata" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={it.media_url} alt={open ? "Their peek" : ""} />}
                {!open ? (
                  <button type="button" className="kc-veil" onClick={(e) => reveal(e, it.media_url)} aria-label={`Show ${it.media_type === "video" ? "video" : "photo"}`}>
                    <b>{it.media_type === "video" ? "video" : "photo"}</b><small>tap to see</small>
                  </button>
                ) : null}
              </span>
            );
          })}
        </span>
      ) : null}
      {k.voice_url ? (
        <span className="kc-voice">
          <small>voice note{k.voice_duration ? ` · ${Math.round(k.voice_duration)}s` : ""}</small>
          <audio src={k.voice_url} controls preload="none" />
        </span>
      ) : null}
    </span>
  );
}
