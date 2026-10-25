"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FONTS_HREF, fontStyleById, type GalleryItem } from "@/lib/chatTheme";
import { intentLabel, timeLeft } from "@/lib/linkup";
import { STARTERS, roomThemeById, roomThemeVars, statusLabel } from "@/lib/roomThemes";
import AppShell from "./AppShell";
import AgeGate from "./AgeGate";
import LinkUpSheet from "./LinkUpSheet";
import Sheet from "./Sheet";

type Hookup = { age: number; gender: string | null; area: string; looking_for: string | null; vibes: string[] } | null;
type Preview = {
  user_id: string;
  room: {
    background_pattern: string; font_style: string; profile_picture_url: string | null; anonymous_name: string;
    gallery: GalleryItem[]; gallery_hidden: number; gallery_visibility: string;
    room_theme: string; intro: string | null; room_status: string | null; knocks_open: boolean; welcome_message: string | null;
  };
  inside: boolean;
  post: { id: string; kind: "hookup" | "confession" | null; content: string; hookup: Hookup; live_until: string | null; live: boolean; linkup_count: number } | null;
  connection_id: string | null;
  my_request: { id: string; status: string } | null;
  incoming_request: { id: string; pitch: string | null; intents: string[]; media_url: string | null; media_type: string | null } | null;
  linkup_cost: number;
};

const REPORT_REASONS: [string, string][] = [
  ["abuse", "Harassment or abuse"],
  ["explicit", "Sexually explicit or unwanted"],
  ["doxxing", "Shares private info"],
  ["spam", "Spam or scam"],
  ["other", "Something else"],
];

const Lock = ({ className = "rm-lock" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);
const Dots = () => (
  <svg viewBox="0 0 24 24" aria-hidden><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
);

// Remembered per connection, so the entrance plays once, not on every visit.
const seenKey = (cid: string) => `anonixx.room.in.${cid}`;
function seen(cid: string) {
  try { return localStorage.getItem(seenKey(cid)) === "1"; } catch { return false; }
}
function markSeen(cid: string) {
  try { localStorage.setItem(seenKey(cid), "1"); } catch { /* storage blocked: it just plays again */ }
}

/** Put an opener in the chat box (ChatPage reads it via useDraft). Never sends. */
function primeDraft(cid: string, text: string) {
  try { localStorage.setItem(`anonixx.draft.chat:${cid}`, JSON.stringify({ v: text, t: Date.now() })); } catch { /* ignore */ }
}

function Inner({ userId, postId }: { userId: string; postId: string | null }) {
  const router = useRouter();
  const { user } = useAuth();
  const [p, setP] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [gate, setGate] = useState(false);
  const [big, setBig] = useState<GalleryItem | null>(null);
  const [sheet, setSheet] = useState(false);
  const [safety, setSafety] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [entrance, setEntrance] = useState(false);
  const [, tick] = useState(0);

  const own = user?.id === userId;

  const load = useCallback(async () => {
    try {
      const r = await api<Preview>(`/chat-profile/${userId}/preview${postId ? `?drop_id=${postId}` : ""}`);
      setP(r);
      setGate(false);
      setError("");
      if (r.connection_id && !own && !seen(r.connection_id)) {
        markSeen(r.connection_id);
        setEntrance(true);
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === "age_verification_required") setGate(true);
      else setError((e as Error).message);
    }
  }, [userId, postId, own]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 60000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const openChat = useCallback((cid: string, opener?: string) => {
    if (opener) primeDraft(cid, opener);
    router.push(`/chat/${cid}`);
  }, [router]);

  async function respond(letIn: boolean) {
    const req = p?.incoming_request;
    if (!req || busy) return;
    setBusy(true);
    try {
      if (letIn) {
        const d = await api<{ connection_id?: string }>(`/unlock-requests/${req.id}/accept`, { method: "POST" });
        if (d.connection_id) return openChat(d.connection_id);
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

  async function cancelKnock() {
    if (!p?.my_request || busy) return;
    setBusy(true);
    try {
      await api(`/unlock-requests/${p.my_request.id}/cancel`, { method: "POST" });
      setToast("Knock taken back. Nothing was charged.");
      await load();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function report(reason: string) {
    setBusy(true);
    try {
      await api(`/users/${userId}/report`, { body: { reason } });
      setSafety(false);
      setToast("Report received. Thank you.");
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function block() {
    if (!window.confirm("Block this person?\n\nTheir Room closes for you and they can't knock on yours.")) return;
    setBusy(true);
    try {
      await api(`/users/${userId}/block`, { method: "POST" });
      router.push("/");
    } catch (e) {
      setToast((e as Error).message);
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
  if (error) {
    return (
      <div className="rm-empty-state">
        <Lock className="rm-lock big" />
        <b>This Room is closed.</b>
        <p>{error}</p>
        <Link href="/" className="room-cta ghost">Back to the feed</Link>
      </div>
    );
  }
  if (!p) {
    return (
      <div className="rm rm-loading" style={roomThemeVars(null)}>
        <span className="rm-atmos" />
        <div className="rm-skel"><i className="a" /><i className="l" /><i className="s" /></div>
      </div>
    );
  }

  const room = p.room;
  const theme = roomThemeById(room.room_theme);
  const name = room.anonymous_name || "Anonymous";
  const pic = room.profile_picture_url;
  const font = fontStyleById(room.font_style);
  const post = p.post;
  const live = !!post?.live;
  const left = live ? timeLeft(post?.live_until) : null;
  const isConfession = post?.kind === "confession";
  const inc = p.incoming_request;
  const cid = p.connection_id;
  const status = statusLabel(room.room_status);
  const h = post?.hookup;
  const gallery = room.gallery || [];
  const hidden = room.gallery_hidden || 0;
  const cost = p.linkup_cost;

  let bar: React.ReactNode;
  if (own) {
    bar = (
      <div className="rm-bar">
        <span>This is your Room, the way visitors see it.</span>
        <Link href="/chat-setup" className="room-cta ghost">Edit Room</Link>
      </div>
    );
  } else if (cid) {
    bar = (
      <div className="rm-bar">
        <span className="rm-in"><i />You&apos;re inside</span>
        <button className="room-cta rm-accent" onClick={() => openChat(cid)}>Open conversation</button>
      </div>
    );
  } else if (inc) {
    bar = (
      <div className="rm-bar decide">
        <button className="room-cta ghost" disabled={busy} onClick={() => respond(false)}>Decline</button>
        <button className="room-cta rm-accent" disabled={busy} onClick={() => respond(true)}>{busy ? "…" : "Let In"}</button>
      </div>
    );
  } else if (p.my_request) {
    bar = (
      <div className="rm-bar">
        <span className="room-pulse" />
        <span>You knocked. {name} decides. {cost ? `${cost} coins leave your wallet only if they let you in.` : "Nothing is charged."}</span>
        <button className="room-cta ghost sm" disabled={busy} onClick={cancelKnock}>Take back</button>
      </div>
    );
  } else if (!room.knocks_open) {
    bar = (
      <div className="rm-bar quiet">
        <span>{name} isn&apos;t answering the door right now. Come back later.</span>
      </div>
    );
  } else if (live && post) {
    bar = (
      <div className="rm-bar knock">
        <button className="rm-knock" onClick={() => setSheet(true)}>
          <span className="rm-knock-t">Knock on {name}&apos;s door</span>
          <em>Free to knock</em>
        </button>
        <small>{cost ? `If ${name} lets you in, ${cost} coins come out of your wallet automatically. Decline or no answer: nothing.` : "Free for you. Nothing is charged."}</small>
      </div>
    );
  } else {
    bar = (
      <div className="rm-bar quiet">
        <span>{name} isn&apos;t taking knocks right now. Catch their next post on the feed.</span>
      </div>
    );
  }

  return (
    <>
      <div className="rm" style={roomThemeVars(room.room_theme)}>
        <link rel="stylesheet" href={FONTS_HREF} precedence="default" />
        <span className="rm-atmos" aria-hidden />
        <div className="rm-scroll">
          <section className="rm-hero">
            <div className="rm-top">
              <span className="rm-kicker">{theme.room}</span>
              {own ? null : (
                <button className="rm-icon" aria-label="Report or block" onClick={() => setSafety(true)}><Dots /></button>
              )}
            </div>
            <span className="rm-ava">
              <span>{pic ? <Image src={pic} alt="" width={104} height={104} /> : name[0]?.toUpperCase() || "A"}</span>
            </span>
            <h1 className="rm-name" style={font}>{name}</h1>
            {status ? <span className="rm-status"><i />{status}</span> : null}
            {room.intro ? (
              <p className="rm-intro" style={font}>{room.intro}</p>
            ) : own ? (
              <Link href="/chat-setup" className="rm-intro empty">Add a line about you. It&apos;s the first thing visitors read.</Link>
            ) : null}
          </section>

          {post ? (
            <section className={`rm-card rm-post${live ? "" : " ended"}`}>
              <div className="rm-label">
                <span>Through the window</span>
                <span className={`rm-chip${live && !isConfession ? " hot" : ""}`}>
                  {isConfession ? "Confession" : live ? (left ? `Tonight · ${left}` : "Live") : "Ended"}
                </span>
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
              {post.linkup_count ? <small className="rm-count">{post.linkup_count} {post.linkup_count === 1 ? "knock" : "knocks"} on this one</small> : null}
            </section>
          ) : null}

          {gallery.length || hidden ? (
            <section className="rm-gallery">
              <div className="rm-label"><span>On the walls</span></div>
              <div className="rm-grid">
                {gallery.map((g, k) => (
                  <button key={k} className="rm-frame" style={{ animationDelay: `${120 + k * 110}ms` }} onClick={() => setBig(g)} aria-label={`Open photo ${k + 1}`}>
                    {g.media_type === "video"
                      ? <video src={g.media_url} muted loop autoPlay playsInline />
                      : <Image src={g.media_url} alt="" width={240} height={320} sizes="33vw" />}
                  </button>
                ))}
                {room.gallery_visibility === "inside" && !own
                  ? Array.from({ length: hidden }).map((_, k) => (
                    <span key={`h${k}`} className="rm-frame veiled"><Lock /></span>
                  ))
                  : null}
              </div>
              {hidden && room.gallery_visibility === "inside" && !own ? (
                <small className="rm-fine">{name} keeps {hidden === 1 ? "this photo" : "these photos"} for people they let in.</small>
              ) : null}
            </section>
          ) : own ? (
            <section className="rm-card rm-note">Your walls are bare. <Link href="/chat-setup">Hang up to 3 photos</Link> so visitors know who they&apos;re knocking for.</section>
          ) : null}

          {inc ? (
            <section className="rm-card rm-pitch">
              <div className="rm-label"><span>{name} knocked on your door</span></div>
              {inc.media_url ? (
                inc.media_type === "video"
                  ? <video src={inc.media_url} muted loop autoPlay playsInline />
                  : <Image src={inc.media_url} alt="" width={300} height={300} style={{ height: "auto" }} />
              ) : null}
              <p>{inc.pitch ? <>&ldquo;{inc.pitch}&rdquo;</> : "No message, just the knock."}</p>
              {inc.intents.length ? <div className="room-intents">{inc.intents.map((i) => <i key={i}>{intentLabel(i)}</i>)}</div> : null}
            </section>
          ) : null}

          {!own && !cid && !inc ? (
            <section className="rm-door">
              <div className="rm-label"><span>Behind the door</span></div>
              <ul>
                <li>A private conversation with {name}. No timer, no charge per message.</li>
                <li>Voice and video calls, if {name} opens them.</li>
                {hidden && room.gallery_visibility === "inside" ? <li>{hidden} more {hidden === 1 ? "photo" : "photos"} {name} saves for people inside.</li> : null}
              </ul>
            </section>
          ) : null}
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

        {entrance && cid ? (
          <div className="rm-enter" role="dialog" aria-modal aria-label={`Welcome to ${name}'s Room`}>
            <div className="rm-enter-in">
              <span className="rm-enter-door" aria-hidden />
              <small>You&apos;re inside.</small>
              <h2 style={font}>Welcome to {name}&apos;s Room.</h2>
              {room.welcome_message ? <blockquote style={font}>&ldquo;{room.welcome_message}&rdquo;</blockquote> : null}
              <div className="rm-starters">
                <span>Need an opener? Tap one to put it in the box. You send it, not us.</span>
                {STARTERS.map((s) => (
                  <button key={s} type="button" onClick={() => openChat(cid, s)}>{s}</button>
                ))}
              </div>
              <button className="room-cta rm-accent wide" onClick={() => openChat(cid)}>Start the conversation</button>
              <button className="u-link-btn" onClick={() => setEntrance(false)}>Look around first</button>
            </div>
          </div>
        ) : null}
      </div>

      {safety ? (
        <Sheet onClose={() => setSafety(false)} title={`Report or block ${name}`}>
          <div className="list">
            {REPORT_REASONS.map(([k, label]) => (
              <button key={k} className="opt-row" disabled={busy} onClick={() => report(k)}>{label}</button>
            ))}
            <button className="opt-row rs-block" disabled={busy} onClick={block}>Block {name}</button>
          </div>
        </Sheet>
      ) : null}

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
