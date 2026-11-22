"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- the Agora SDK is loaded dynamically and typed loosely here */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Bell, BellRing, Coins, Eye, Flag, Gift as GiftIcon, Lock, Megaphone, Mic, MicOff, Send, Share2, Users, Video, VideoOff, X,
} from "lucide-react";
import AuthorAvatar from "@/components/AuthorAvatar";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useConfirm } from "@/lib/confirm";
import { connectSocket } from "@/lib/socket";
import {
  GIFT_EMOJI, PROMO_OPTIONS, livesApi, startsLabel,
  type Gift, type LiveDetail, type LiveMessage, type Stream, type WatchReply,
} from "@/lib/lives";
import "@/app/lives.css";

type Phase = "loading" | "scheduled" | "connecting" | "preview" | "locked" | "watching" | "hosting" | "ended" | "error";

const HEARTBEAT_MS = 20_000;
const POLL_MS = 5_000;
const CHAT_KEEP = 80;

export default function LiveRoom({ id, autoStart = false }: { id: string; autoStart?: boolean }) {
  const router = useRouter();
  const { user, ready, refresh } = useAuth();
  const confirm = useConfirm();

  const [detail, setDetail] = useState<LiveDetail | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [previewEnds, setPreviewEnds] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [viewers, setViewers] = useState(0);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [text, setText] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [burst, setBurst] = useState<LiveMessage | null>(null);
  const [hostVideo, setHostVideo] = useState(false);

  const stage = useRef<HTMLDivElement>(null);
  const client = useRef<any>(null);
  const tracks = useRef<{ mic?: any; cam?: any }>({});
  const lastId = useRef<string | undefined>(undefined);
  const phaseRef = useRef<Phase>("loading");
  phaseRef.current = phase;

  const flash = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(""), 2600); }, []);

  const addMessages = useCallback((incoming: LiveMessage[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      if (!fresh.length) return prev;
      lastId.current = fresh[fresh.length - 1].id;
      const gift = [...fresh].reverse().find((m) => m.kind === "gift");
      if (gift) { setBurst(gift); window.setTimeout(() => setBurst((b) => (b?.id === gift.id ? null : b)), 2800); }
      return [...prev, ...fresh].slice(-CHAT_KEEP);
    });
  }, []);

  const leave = useCallback(async () => {
    const c = client.current;
    client.current = null;
    tracks.current.mic?.close();
    tracks.current.cam?.close();
    tracks.current = {};
    setHostVideo(false);
    if (c) { try { await c.leave(); } catch { /* already gone */ } }
  }, []);

  const connect = useCallback(async (stream: Stream, role: "host" | "audience") => {
    await leave();
    const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
    AgoraRTC.setLogLevel(3);
    const c = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
    client.current = c;
    await c.setClientRole(role === "host" ? "host" : "audience", role === "audience" ? { level: 1 } : undefined);

    c.on("user-published", async (u: any, type: "audio" | "video") => {
      if (u.uid !== stream.host_uid) return;
      try {
        await c.subscribe(u, type);
        if (type === "video" && stage.current) { u.videoTrack?.play(stage.current, { fit: "cover" }); setHostVideo(true); }
        if (type === "audio") u.audioTrack?.play();
      } catch { /* host left mid-subscribe */ }
    });
    c.on("user-unpublished", (u: any, type: "audio" | "video") => { if (u.uid === stream.host_uid && type === "video") setHostVideo(false); });
    c.on("token-privilege-will-expire", async () => {
      if (phaseRef.current === "preview") return;
      try { const r = await livesApi.renew(id); await c.renewToken(r.stream.token); } catch { /* handled on expiry */ }
    });
    c.on("token-privilege-did-expire", () => {
      if (phaseRef.current === "preview") { setPhase("locked"); leave(); }
    });

    await c.join(stream.app_id, stream.channel, stream.token, stream.uid);
    if (role === "host") {
      const [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks();
      tracks.current = { mic, cam };
      if (stage.current) cam.play(stage.current, { fit: "cover", mirror: true });
      setHostVideo(true);
      await c.publish([mic, cam]);
    }
  }, [id, leave]);

  const startWatching = useCallback(async (reply: WatchReply) => {
    setPhase("connecting");
    await connect(reply.stream, "audience");
    if (reply.member) {
      setPreviewEnds(null);
      setPhase("watching");
      const r = await livesApi.messages(id);
      addMessages(r.messages);
    } else {
      setPreviewEnds(reply.preview_ends_at ? new Date(reply.preview_ends_at).getTime() : Date.now() + 30_000);
      setPhase("preview");
    }
  }, [connect, id, addMessages]);

  const load = useCallback(async () => {
    try {
      const d = await livesApi.detail(id);
      setDetail(d);
      setViewers(d.live.viewers);
      if (d.live.status === "ended") { setPhase("ended"); return; }
      if (d.live.status === "scheduled" && !(autoStart && d.viewer.is_host)) { setPhase("scheduled"); return; }
      if (!user) { setPhase("locked"); return; }
      setPhase("connecting");
      if (d.viewer.is_host) {
        const r = await livesApi.start(id);
        await connect(r.stream, "host");
        setPhase("hosting");
        addMessages((await livesApi.messages(id)).messages);
        return;
      }
      try {
        await startWatching(await livesApi.watch(id));
      } catch (e) {
        if (e instanceof ApiError && e.code === "preview_over") setPhase("locked");
        else throw e;
      }
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }, [id, user, autoStart, connect, startWatching, addMessages]);

  useEffect(() => { if (ready) load(); }, [ready, load]);
  useEffect(() => () => { leave(); }, [leave]);
  useEffect(() => { livesApi.gifts().then((r) => setGifts(r.gifts)).catch(() => {}); }, []);

  // Preview countdown; the server's token expiry is the real gate.
  useEffect(() => {
    if (phase !== "preview" || !previewEnds) return;
    const t = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= previewEnds) { setPhase("locked"); leave(); }
    }, 500);
    return () => window.clearInterval(t);
  }, [phase, previewEnds, leave]);

  const inRoom = phase === "watching" || phase === "hosting";
  const onAir = inRoom || phase === "preview";

  useEffect(() => {
    if (!onAir) return;
    const beat = () => livesApi.heartbeat(id).then((r) => setViewers(r.viewers)).catch(() => {});
    beat();
    const t = window.setInterval(beat, HEARTBEAT_MS);
    return () => window.clearInterval(t);
  }, [onAir, id]);

  useEffect(() => {
    if (!inRoom) return;
    const socket = connectSocket();
    socket?.on("live_message", (p: { live_id: string; message: LiveMessage }) => { if (p.live_id === id) addMessages([p.message]); });
    socket?.on("live_ended", (p: { live_id: string }) => { if (p.live_id === id) { setPhase("ended"); leave(); } });
    const poll = window.setInterval(async () => {
      try {
        const r = await livesApi.messages(id, lastId.current);
        addMessages(r.messages);
        if (r.status === "ended") { setPhase("ended"); leave(); }
      } catch { /* next tick */ }
    }, POLL_MS);
    return () => { window.clearInterval(poll); socket?.disconnect(); };
  }, [inRoom, id, addMessages, leave]);

  async function join() {
    if (!detail) return;
    if (!user) { router.push(`/login?next=/lives/${id}`); return; }
    const { price, host } = detail.live;
    const ok = await confirm({
      title: `Join ${host.name || "this"}'s live?`,
      icon: "coins",
      message: "You stay a member until the live ends. Chat with the host and send gifts.",
      detail: (
        <>
          <div className="cf-row"><span>Entry</span><b className="cf-cost">{price} coins</b></div>
          <div className="cf-row"><span>Your balance</span><b>{user.coin_balance} coins</b></div>
        </>
      ),
      confirmLabel: `Pay ${price} coins`,
    });
    if (!ok) return;
    try {
      const reply = await livesApi.join(id);
      refresh();
      await startWatching(reply);
    } catch (e) {
      if (e instanceof ApiError && e.code === "coins_short") { router.push("/coins"); return; }
      flash((e as Error).message);
    }
  }

  async function goLiveNow() {
    const ok = await confirm({ title: "Go live now?", message: "Your camera and mic turn on, and your followers get notified.", confirmLabel: "Go live", icon: "live" });
    if (!ok) return;
    try {
      setPhase("connecting");
      const r = await livesApi.start(id);
      await connect(r.stream, "host");
      setPhase("hosting");
      setDetail((d) => (d ? { ...d, live: { ...d.live, status: "live" } } : d));
    } catch (e) {
      flash((e as Error).message);
      setPhase("scheduled");
    }
  }

  async function endLive() {
    const ok = await confirm({ title: "End this live?", message: "Everyone is sent out and the live can't be restarted.", confirmLabel: "End live", tone: "danger", icon: "live" });
    if (!ok) return;
    try { await livesApi.end(id); await leave(); setPhase("ended"); } catch (e) { flash((e as Error).message); }
  }

  async function sendGift(g: Gift) {
    const ok = await confirm({
      title: `Send a ${g.label}?`,
      icon: "coins",
      message: `${GIFT_EMOJI[g.id] || ""} It goes straight to ${detail?.live.host.name || "the host"}.`,
      detail: <div className="cf-row"><span>Cost</span><b className="cf-cost">{g.coins} coin{g.coins === 1 ? "" : "s"}</b></div>,
      confirmLabel: `Send ${g.label}`,
    });
    if (!ok) return;
    try {
      const r = await livesApi.gift(id, g.id);
      addMessages([r.message]);
      refresh();
      setGiftsOpen(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === "coins_short") { router.push("/coins"); return; }
      flash((e as Error).message);
    }
  }

  async function promote(hours: number, coins: number) {
    const ok = await confirm({
      title: `Promote for ${hours === 1 ? "1 hour" : `${hours} hours`}?`,
      icon: "boost",
      message: "Your live shows up in the main feed for everyone.",
      detail: <div className="cf-row"><span>Cost</span><b className="cf-cost">{coins} coins</b></div>,
      confirmLabel: `Pay ${coins} coins`,
    });
    if (!ok) return;
    try {
      await livesApi.promote(id, hours);
      refresh();
      setPromoOpen(false);
      flash("Your live is promoted in the feed.");
    } catch (e) {
      if (e instanceof ApiError && e.code === "coins_short") { router.push("/coins"); return; }
      flash((e as Error).message);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    try { addMessages([(await livesApi.send(id, body)).message]); } catch (err) { setText(body); flash((err as Error).message); }
  }

  async function toggleFollow() {
    if (!detail || !user) return;
    try {
      const r = await livesApi.follow(detail.live.host.id);
      setDetail({ ...detail, host_followers: r.followers, viewer: { ...detail.viewer, following: r.following } });
    } catch (e) { flash((e as Error).message); }
  }

  async function toggleRemind() {
    if (!detail) return;
    if (!user) { router.push(`/login?next=/lives/${id}`); return; }
    try {
      const r = await livesApi.remind(id);
      setDetail({ ...detail, viewer: { ...detail.viewer, reminded: r.reminded } });
      flash(r.reminded ? "We'll tell you when it starts." : "Reminder off.");
    } catch (e) { flash((e as Error).message); }
  }

  async function report() {
    const ok = await confirm({ title: "Report this live?", message: "Our team will review it. The host won't know who reported.", confirmLabel: "Report", tone: "danger", icon: "report" });
    if (!ok) return;
    try { await livesApi.report(id, "Reported from the live room"); flash("Thanks. We'll take a look."); } catch (e) { flash((e as Error).message); }
  }

  async function share() {
    const url = `${window.location.origin}/lives/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: "Anonixx Live", text: "Someone is live on Anonixx.", url });
      else { await navigator.clipboard.writeText(url); flash("Link copied"); }
    } catch { /* dismissed */ }
  }

  function toggleMic() { tracks.current.mic?.setEnabled(!micOn); setMicOn(!micOn); }
  function toggleCam() { tracks.current.cam?.setEnabled(!camOn); setCamOn(!camOn); }

  if (phase === "error") {
    return <div className="lr-shell lr-center"><p className="err">{error}</p><Link className="pill" href="/lives">Back to lives</Link></div>;
  }

  const live = detail?.live;
  const host = live?.host;
  const isHost = Boolean(detail?.viewer.is_host);
  const previewLeft = previewEnds ? Math.max(0, Math.ceil((previewEnds - now) / 1000)) : 0;

  return (
    <div className="lr-shell">
      <div ref={stage} className="lr-stage" aria-label="Live video" />
      {!hostVideo ? (
        <div className="lr-placeholder">
          {live?.cover_url ? <Image src={live.cover_url} alt="" fill sizes="100vw" className="lr-cover" /> : null}
          {host ? <span className="lr-big-ava"><AuthorAvatar src={host.avatar_url} seed={host.id} name={host.name} gender={host.gender} size={96} /></span> : null}
        </div>
      ) : null}

      <header className="lr-top">
        {host ? (
          <div className="lr-host">
            <span className="lr-ava"><AuthorAvatar src={host.avatar_url} seed={host.id} name={host.name} gender={host.gender} size={36} /></span>
            <div className="lr-host-text">
              <b>{host.name || "Anonymous"}</b>
              <small>{detail?.host_followers ?? 0} followers</small>
            </div>
            {!isHost && user ? (
              <button className={`lr-follow${detail?.viewer.following ? " on" : ""}`} onClick={toggleFollow}>{detail?.viewer.following ? "Following" : "Follow"}</button>
            ) : null}
          </div>
        ) : <span />}
        <div className="lr-top-right">
          {onAir ? <span className="lr-chip live">LIVE</span> : null}
          {onAir ? <span className="lr-chip"><Eye aria-hidden />{viewers}</span> : null}
          <button className="lr-round" onClick={() => router.push("/lives")} aria-label="Close"><X aria-hidden /></button>
        </div>
      </header>

      {detail?.top_gifters.length ? (
        <div className="lr-gifters" aria-label="Top gifters">
          {detail.top_gifters.slice(0, 3).map((g, i) => (
            <span key={g.user_id} className="lr-gifter" title={`${g.name} · ${g.coins} coins`}>
              <AuthorAvatar src={g.avatar_url} seed={g.user_id} name={g.name} gender={g.gender} size={26} /><em>{i + 1}</em>
            </span>
          ))}
        </div>
      ) : null}

      {phase === "preview" ? <div className="lr-preview">Preview · 0:{String(previewLeft).padStart(2, "0")}</div> : null}
      {burst ? (
        <div className="lr-burst" key={burst.id}>
          <span className="lr-burst-emoji">{GIFT_EMOJI[burst.gift || ""] || "🎁"}</span>
          <span><b>{burst.user.name}</b> sent a {burst.gift}</span>
        </div>
      ) : null}

      {phase === "loading" || phase === "connecting" ? <div className="lr-overlay"><span className="lr-spinner" aria-label="Loading" /></div> : null}

      {phase === "scheduled" && live ? (
        <div className="lr-overlay lr-card">
          <h1>{live.title}</h1>
          {live.about ? <p className="muted">{live.about}</p> : null}
          <p className="lr-when">Starts {startsLabel(live.starts_at)}</p>
          {isHost ? (
            <button className="pill" onClick={goLiveNow}>Go live now</button>
          ) : (
            <button className={`pill${detail?.viewer.reminded ? " ghost" : ""}`} onClick={toggleRemind}>
              {detail?.viewer.reminded ? <><BellRing aria-hidden />Reminder set</> : <><Bell aria-hidden />Remind me</>}
            </button>
          )}
          <small className="muted"><Coins aria-hidden /> {live.price} coins to join</small>
        </div>
      ) : null}

      {phase === "locked" && live ? (
        <div className="lr-overlay lr-card lr-lock">
          <Lock aria-hidden className="lr-lock-ic" />
          <h1>{user ? "Your preview is over" : live.title}</h1>
          <p className="muted">{user ? `Join to keep watching ${host?.name || "the host"} and chat live.` : "Sign in to watch a free 30-second preview."}</p>
          {user ? (
            <button className="pill lr-join" onClick={join}>Join · <Coins aria-hidden />{live.price}</button>
          ) : (
            <Link className="pill" href={`/login?next=/lives/${id}`}>Sign in</Link>
          )}
          <small className="muted"><Users aria-hidden /> {live.members} members inside</small>
        </div>
      ) : null}

      {phase === "ended" ? (
        <div className="lr-overlay lr-card">
          <h1>This live has ended</h1>
          <p className="muted">{isHost ? "Thanks for hosting. Your earnings are on the way at the end of the week." : "Follow the host to hear about their next live."}</p>
          <div className="lr-row">
            {isHost ? <Link className="pill" href="/lives/earnings">See earnings</Link> : null}
            <Link className="pill ghost" href="/lives">More lives</Link>
          </div>
        </div>
      ) : null}

      {inRoom || phase === "preview" ? (
        <footer className="lr-bottom">
          {inRoom ? (
            <ol className="lr-chat" aria-live="polite">
              {messages.map((m) => (
                <li key={m.id} className={`lr-msg ${m.kind}`}>
                  <b>{m.user.name}</b>{" "}
                  {m.kind === "gift" ? <>sent a {m.gift} {GIFT_EMOJI[m.gift || ""]}</> : m.kind === "join" ? "joined" : m.text}
                </li>
              ))}
            </ol>
          ) : null}

          <div className="lr-actions">
            {phase === "preview" ? (
              <button className="pill lr-join" onClick={join}>Join · <Coins aria-hidden />{live?.price}</button>
            ) : (
              <form className="lr-input" onSubmit={send}>
                <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={isHost ? "Talk to your members…" : "Say something…"} aria-label="Message" />
                <button type="submit" aria-label="Send" disabled={!text.trim()}><Send aria-hidden /></button>
              </form>
            )}
            {phase === "watching" ? <button className="lr-round hot" onClick={() => setGiftsOpen(true)} aria-label="Send a gift"><GiftIcon aria-hidden /></button> : null}
            {isHost && phase === "hosting" ? (
              <>
                <button className="lr-round" onClick={toggleMic} aria-label={micOn ? "Mute mic" : "Unmute mic"}>{micOn ? <Mic aria-hidden /> : <MicOff aria-hidden />}</button>
                <button className="lr-round" onClick={toggleCam} aria-label={camOn ? "Turn camera off" : "Turn camera on"}>{camOn ? <Video aria-hidden /> : <VideoOff aria-hidden />}</button>
                <button className="lr-round" onClick={() => setPromoOpen(true)} aria-label="Promote in the feed"><Megaphone aria-hidden /></button>
                <button className="lr-end" onClick={endLive}>End</button>
              </>
            ) : null}
            <button className="lr-round" onClick={share} aria-label="Share"><Share2 aria-hidden /></button>
            {!isHost ? <button className="lr-round" onClick={report} aria-label="Report"><Flag aria-hidden /></button> : null}
          </div>
        </footer>
      ) : null}

      {giftsOpen ? (
        <div className="lr-sheet-back" onClick={() => setGiftsOpen(false)}>
          <div className="lr-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Send a gift">
            <h3>Send a gift</h3>
            <p className="muted small">Gifts go fully to {host?.name || "the host"}. Balance: {user?.coin_balance ?? 0} coins</p>
            <div className="lr-gifts">
              {gifts.map((g) => (
                <button key={g.id} onClick={() => sendGift(g)}>
                  <span className="lr-gift-emoji">{GIFT_EMOJI[g.id]}</span>
                  <b>{g.label}</b>
                  <small><Coins aria-hidden />{g.coins}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {promoOpen ? (
        <div className="lr-sheet-back" onClick={() => setPromoOpen(false)}>
          <div className="lr-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Promote your live">
            <h3>Promote in the feed</h3>
            <p className="muted small">Your live appears in everyone&apos;s main feed while it&apos;s promoted.</p>
            <div className="lr-promos">
              {PROMO_OPTIONS.map((o) => (
                <button key={o.hours} onClick={() => promote(o.hours, o.coins)}>
                  <b>{o.label}</b><small><Coins aria-hidden />{o.coins}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="lr-toast" role="status">{toast}</div> : null}
    </div>
  );
}
