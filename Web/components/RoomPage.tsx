"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ChatBackground, FONTS_HREF, fontStyleById, type GalleryItem } from "@/lib/chatTheme";
import { intentLabel, timeLeft } from "@/lib/linkup";
import AppShell from "./AppShell";
import AgeGate from "./AgeGate";
import LinkUpSheet from "./LinkUpSheet";

type Hookup = { age: number; gender: string | null; area: string; looking_for: string | null; vibes: string[] } | null;
type Preview = {
  user_id: string;
  room: { background_pattern: string; font_style: string; profile_picture_url: string | null; anonymous_name: string; gallery: GalleryItem[] };
  post: { id: string; kind: "hookup" | "confession" | null; content: string; hookup: Hookup; live_until: string | null; live: boolean; linkup_count: number } | null;
  connection_id: string | null;
  my_request: { id: string; status: string } | null;
  incoming_request: { id: string; pitch: string | null; intents: string[]; media_url: string | null; media_type: string | null } | null;
  linkup_cost: number;
};

const Lock = () => (
  <svg className="room-lock" viewBox="0 0 24 24" aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);

function Inner({ userId, postId }: { userId: string; postId: string | null }) {
  const router = useRouter();
  const { user } = useAuth();
  const [p, setP] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [gate, setGate] = useState(false);
  const [shown, setShown] = useState(0);
  const [big, setBig] = useState<GalleryItem | null>(null);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [opening, setOpening] = useState(false);
  const [, tick] = useState(0);
  const end = useRef<HTMLDivElement>(null);

  const own = user?.id === userId;

  const enter = useCallback((connectionId: string) => {
    setOpening(true);
    window.setTimeout(() => router.push(`/chat/${connectionId}`), 650);
  }, [router]);

  const load = useCallback(async () => {
    try {
      const r = await api<Preview>(`/chat-profile/${userId}/preview${postId ? `?drop_id=${postId}` : ""}`);
      setP(r);
      setGate(false);
      if (r.connection_id && !own) enter(r.connection_id);
    } catch (e) {
      if (e instanceof ApiError && e.code === "age_verification_required") setGate(true);
      else setError((e as Error).message);
    }
  }, [userId, postId, own, enter]);

  useEffect(() => { load(); }, [load]);

  // Gallery arrives like messages: typing dots, then the next photo.
  const total = p?.room.gallery.length || 0;
  useEffect(() => {
    if (shown >= total) return;
    const t = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 500 : 900);
    return () => window.clearTimeout(t);
  }, [shown, total]);

  useEffect(() => {
    if (shown) end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [shown]);

  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 60000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function respond(accept: boolean) {
    const req = p?.incoming_request;
    if (!req || busy) return;
    setBusy(true);
    try {
      if (accept) {
        const d = await api<{ connection_id?: string }>(`/unlock-requests/${req.id}/accept`, { method: "POST" });
        if (d.connection_id) return enter(d.connection_id);
        await load();
      } else {
        await api(`/unlock-requests/${req.id}/decline`, { method: "POST" });
        router.push("/inbox?tab=requests");
      }
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (gate) {
    return (
      <div className="room-gate">
        <AgeGate onDone={load} />
      </div>
    );
  }
  if (error) return <div className="err pad">{error}</div>;
  if (!p) return <p className="muted center">Opening the Room…</p>;

  const name = p.room.anonymous_name || "Anonymous";
  const pic = p.room.profile_picture_url;
  const post = p.post;
  const left = post?.live ? timeLeft(post.live_until) : null;
  const live = !!post?.live;
  const isConfession = post?.kind === "confession";   // no clock: open to link ups from here
  const inc = p.incoming_request;
  const locked = () => setToast(own ? "This is your Room as others see it." : "Calls open once you link up.");
  const h = post?.hookup;

  let bar: React.ReactNode;
  if (own) {
    bar = (
      <div className="room-bar own">
        <span>This is your Room, as everyone else sees it.</span>
        <Link href="/chat-setup" className="room-cta ghost">Edit Room</Link>
      </div>
    );
  } else if (inc) {
    bar = (
      <div className="room-bar decide">
        <button className="room-cta ghost" disabled={busy} onClick={() => respond(false)}>Decline</button>
        <button className="room-cta" disabled={busy} onClick={() => respond(true)}>{busy ? "…" : "Accept, open the chat"}</button>
      </div>
    );
  } else if (p.my_request) {
    bar = (
      <div className="room-bar waiting">
        <span className="room-pulse" />
        <span>Link up sent. {name} sees your line first, you pay nothing unless they say yes.</span>
      </div>
    );
  } else if (live && post) {
    bar = (
      <div className="room-bar">
        <button className="room-cta velvet" onClick={() => setSheet(true)}>
          <Lock />
          <span>Link up with <b>{name}</b></span>
          <em>{p.linkup_cost ? `${p.linkup_cost} coins` : "free"}</em>
        </button>
      </div>
    );
  } else {
    bar = (
      <div className="room-bar quiet">
        <span>{name} isn&apos;t taking link ups right now. Catch their next post on the feed.</span>
      </div>
    );
  }

  return (
    <>
      <div className={`chat u-themed room${opening ? " opening" : ""}`} style={fontStyleById(p.room.font_style)}>
        <link rel="stylesheet" href={FONTS_HREF} precedence="default" />
        <ChatBackground id={p.room.background_pattern} />
        <div className="chat-head u-chat-head">
          <span className="u-ava">
            <span style={pic ? undefined : { background: "var(--rose-dim)", color: "var(--rose)" }}>
              {pic ? <Image src={pic} alt="" width={38} height={38} /> : name[0]?.toUpperCase() || "A"}
            </span>
          </span>
          <span className="u-head-t">
            <b>{name}</b>
            <small className="room-sub">{own ? "your Room" : isConfession ? "open to link ups" : live ? "taking link ups tonight" : "Room locked"}</small>
          </span>
          <button className="call-btn room-locked" onClick={locked} aria-label="Voice call, locked">
            <svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></svg>
            <Lock />
          </button>
          <button className="call-btn room-locked" onClick={locked} aria-label="Video call, locked">
            <svg viewBox="0 0 24 24"><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M16 10l6-3v10l-6-3" /></svg>
            <Lock />
          </button>
        </div>

        {post ? (
          <div className={`room-pin${live ? "" : " ended"}`}>
            <div className="room-pin-top">
              <span className={`room-chip${live && !isConfession ? " hot" : ""}`}>{isConfession ? "Confession" : live ? (left ? `Tonight · ${left}` : "Live") : "Ended"}</span>
              {post.linkup_count ? <span className="room-chip">{post.linkup_count} linked up</span> : null}
            </div>
            {h ? (
              <div className="room-facts">
                <b>{h.age}</b>
                {h.area ? <span>{h.area}</span> : null}
                {h.looking_for ? <span>into {h.looking_for}</span> : null}
              </div>
            ) : null}
            {post.content ? <p>&ldquo;{post.content}&rdquo;</p> : null}
            {h?.vibes?.length ? <div className="room-vibes">{h.vibes.map((v) => <i key={v}>{v}</i>)}</div> : null}
          </div>
        ) : null}

        <div className="chat-log room-log">
          {p.room.gallery.slice(0, shown).map((g, k) => (
            <button key={k} className="room-shot" onClick={() => setBig(g)} aria-label="View">
              {g.media_type === "video" ? <video src={g.media_url} muted loop autoPlay playsInline /> : <Image src={g.media_url} alt="" width={300} height={400} sizes="62vw" />}
            </button>
          ))}
          {shown < total ? <div className="room-typing"><i /><i /><i /></div> : null}
          {total === 0 ? <div className="bubble room-note">{own ? "Your Room is empty. Add 3 photos so link ups know who they're meeting." : `${name} hasn't hung anything in their Room yet.`}</div> : null}
          {inc ? (
            <div className="bubble room-pitch">
              <small>their line</small>
              {inc.media_url ? (
                inc.media_type === "video"
                  ? <video src={inc.media_url} muted loop autoPlay playsInline />
                  : <Image src={inc.media_url} alt="" width={300} height={300} style={{ height: "auto" }} />
              ) : null}
              <span>{inc.pitch || `${name} wants to link up.`}</span>
              {inc.intents.length ? <div className="room-intents">{inc.intents.map((i) => <i key={i}>{intentLabel(i)}</i>)}</div> : null}
            </div>
          ) : null}
          <div ref={end} />
        </div>

        {bar}
        {toast ? <div className="room-toast">{toast}</div> : null}

        {big ? (
          <div className="u-modal" onClick={() => setBig(null)}>
            {big.media_type === "video" ? (
              <video src={big.media_url} controls autoPlay loop playsInline onClick={(e) => e.stopPropagation()} />
            ) : (
              <Image src={big.media_url} alt="" width={800} height={1000} />
            )}
            <button className="u-modal-x" aria-label="Close" onClick={() => setBig(null)}>×</button>
          </div>
        ) : null}
      </div>
      {sheet && post ? (
        <LinkUpSheet
          post={{ id: post.id, anonymous_name: name, avatar_url: pic, content: post.content }}
          onClose={() => setSheet(false)}
          onDone={load}
          viaProfile
        />
      ) : null}
    </>
  );
}

export default function RoomPage({ userId, postId }: { userId: string; postId: string | null }) {
  return (
    <AppShell title="Room" back="/">
      <Inner userId={userId} postId={postId} />
    </AppShell>
  );
}
