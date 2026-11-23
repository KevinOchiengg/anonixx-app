"use client";
/** Incoming 1-to-1 Room call, over any page. Rings from the socket (`call_incoming`); when the
 * tab becomes visible again it also asks GET /drop-calls/live, so a call that rang while the
 * socket was down still shows. Accept opens the call right here; decline tells the caller.
 * Mounted once in the root layout. */
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { connectSocket } from "@/lib/socket";
import { callsApi, callInfo, QUICK_REPLIES, sendQuickReply } from "@/lib/calls";
import CallRoom, { type CallInfo } from "./CallRoom";
import { startCallSound, stopCallSound } from "@/lib/callSounds";

type Ring = { call_id: string; connection_id?: string; caller_name?: string; caller_avatar?: string | null; video?: boolean; ring_seconds?: number };

export default function IncomingCall() {
  const { user } = useAuth();
  const [ring, setRing] = useState<Ring | null>(null);
  const [busy, setBusy] = useState(false);
  const [replying, setReplying] = useState(false);
  const router = useRouter();
  const [call, setCall] = useState<CallInfo | null>(null);
  const [note, setNote] = useState("");
  const timer = useRef<number | null>(null);
  const prevTitle = useRef("");

  const clear = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    stopCallSound();
    if (prevTitle.current) { document.title = prevTitle.current; prevTitle.current = ""; }
    setRing(null);
    setBusy(false);
    setReplying(false);
  }, []);

  const show = useCallback((r: Ring) => {
    setRing((cur) => (cur && cur.call_id !== r.call_id ? cur : r));
    if (!prevTitle.current) prevTitle.current = document.title;
    document.title = `📞 ${r.caller_name || "Someone"} is calling`;
    try { navigator.vibrate?.([400, 300, 400]); } catch { /* not supported */ }
    startCallSound("ringtone");
    callsApi.ringing(r.call_id).catch(() => {});
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(clear, ((r.ring_seconds || 45) + 2) * 1000);
  }, [clear]);

  useEffect(() => {
    if (!user) return;
    const so = connectSocket();
    if (!so) return;
    so.on("call_incoming", (r: Ring) => show(r));
    const gone = (e: { call_id?: string }) => setRing((cur) => {
      if (cur && cur.call_id === e?.call_id) { window.setTimeout(clear, 0); }
      return cur;
    });
    so.on("call_cancelled", gone);
    so.on("call_missed", gone);
    so.on("drop_call_ended", gone);
    return () => { so.disconnect(); };
  }, [user, show, clear]);

  // Fallback: on load and whenever the tab comes back, look for a call still ringing for me.
  useEffect(() => {
    if (!user) return;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const live = await callsApi.live();
        const r = live.direct.find((d) => d.incoming && d.status === "ringing");
        if (r) show({ call_id: r.id, connection_id: r.connection_id, caller_name: r.other?.name, caller_avatar: r.other?.avatar_url, video: r.video });
      } catch { /* offline */ }
    };
    void check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [user, show]);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(""), 3000);
    return () => window.clearTimeout(t);
  }, [note]);

  async function accept() {
    if (!ring || busy) return;
    setBusy(true);
    const r = ring;
    try {
      const d = await callsApi.accept(r.call_id);
      clear();
      setCall(callInfo(d, { other: { name: r.caller_name, avatar_url: r.caller_avatar, ...(d.other || {}) } }));
    } catch (e) {
      clear();
      setNote((e as Error).message || "This call has ended.");
    }
  }

  async function decline() {
    if (!ring) return;
    const id = ring.call_id;
    clear();
    try { await callsApi.decline(id); } catch { /* it ends by itself */ }
  }

  async function replyWith(content: string) {
    if (!ring) return;
    const { call_id: id, connection_id: cid } = ring;
    clear();
    callsApi.decline(id).catch(() => {});
    if (!cid) return;
    if (!content) { router.push(`/chat/${cid}`); return; }
    try {
      await sendQuickReply(cid, content);
      setNote("Message sent.");
    } catch {
      setNote("Couldn’t send it. Try again.");
    }
  }

  if (call) return <CallRoom info={call} onClose={() => setCall(null)} />;
  if (note) return <div className="ic-note" role="status">{note}</div>;
  if (!ring) return null;
  const name = ring.caller_name || "Someone";
  return (
    <div className="ic-call" role="alertdialog" aria-modal aria-label={`${name} is calling`}>
      <div className="ic-in">
        <small>{ring.video ? "Video call" : "Voice call"} · from your Room</small>
        <span className="ic-ava">
          {ring.caller_avatar ? <Image src={ring.caller_avatar} alt="" width={120} height={120} /> : name[0].toUpperCase()}
        </span>
        <b>{name}</b>
        <span className="ic-sub">is calling you</span>
        {replying ? (
          <div className="ic-replies">
            {QUICK_REPLIES.map((r) => <button key={r} type="button" onClick={() => void replyWith(r)}>{r}</button>)}
            <button type="button" className="own" onClick={() => void replyWith("")}>Write your own…</button>
          </div>
        ) : null}
        <div className="ic-acts">
          <button className="ic-no" onClick={decline}>Decline</button>
          {ring.connection_id ? (
            <button type="button" className="ic-msg" onClick={() => setReplying((v) => !v)} aria-expanded={replying}>Message</button>
          ) : null}
          <button className="ic-yes" onClick={accept} disabled={busy} autoFocus>{busy ? "Connecting…" : "Accept"}</button>
        </div>
      </div>
    </div>
  );
}
