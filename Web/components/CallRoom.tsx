"use client";
/** A Room call on Agora (web SDK). Same rules as the app's DropCallScreen:
 * kind "direct": 1-to-1. The caller arrives "ringing" and is already in the channel, so audio
 *   connects the moment they accept; declined / missed / no answer close it. Either side ends it.
 * kind "group": a session in the owner's Room. The host sees who's in and can mute or remove
 *   someone, and ends it for all; guests leave.
 * Leaving a call never touches the Room conversation. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { enterCallFullscreen, exitCallFullscreen } from "@/lib/fullscreen";
import Image from "next/image";
import { connectSocket } from "@/lib/socket";
import { playEndTone, startCallSound, stopCallSound } from "@/lib/callSounds";
import { callInfo, callsApi, type Participant, type Person } from "@/lib/calls";
import { Maximize2, Mic, MicOff, Minimize2, Phone, PhoneOff, PictureInPicture2, ScreenShare, ScreenShareOff, Settings2, Smile, SwitchCamera, Users, Video, VideoOff, Wifi, WifiOff, X } from "lucide-react";
import AuthorAvatar from "@/components/AuthorAvatar";

export type CallInfo = {
  callId: string;
  channel: string;
  token: string;
  uid: number;
  appId: string;
  isHost: boolean;
  audioOnly: boolean;
  hostName?: string;
  kind?: "group" | "direct";
  status?: "ringing" | "active";
  ringSeconds?: number;
  other?: Person;
  reachable?: boolean;
  connectionId?: string;
};

type AnyTrack = {
  play: (el: HTMLElement | string) => void;
  stop: () => void;
  close: () => void;
  setEnabled: (on: boolean) => Promise<void>;
  setDevice?: (id: string) => Promise<void>;
};
type Remote = { uid: number; video?: AnyTrack; muted: boolean };

const ico = { strokeWidth: 2, "aria-hidden": true } as const;
const MicI = ({ off }: { off?: boolean }) => (off ? <MicOff {...ico} /> : <Mic {...ico} />);
const CamI = ({ off }: { off?: boolean }) => (off ? <VideoOff {...ico} /> : <Video {...ico} />);
const ScreenI = ({ off }: { off?: boolean }) => (off ? <ScreenShareOff {...ico} /> : <ScreenShare {...ico} />);
const FlipI = () => <SwitchCamera {...ico} />;
const EndI = () => <PhoneOff {...ico} />;
const PeopleI = () => <Users {...ico} />;

/** Their photo, blurred and dark, behind a ringing or voice call. */
function Backdrop({ p }: { p?: Person | null }) {
  return (
    <div className="cr-backdrop" aria-hidden>
      {p?.avatar_url ? <span style={{ backgroundImage: `url("${encodeURI(p.avatar_url)}")` }} /> : null}
    </div>
  );
}

function Ava({ p, size }: { p?: Person | null; size: number }) {
  const name = p?.name || "A";
  return (
    <span className="cr-bigava" style={{ width: size, height: size }}>
      {p?.avatar_url ? <Image src={p.avatar_url} alt="" fill sizes={`${size}px`} /> : <AuthorAvatar name={name} size={size} />}
    </span>
  );
}

function Tile({ label, track, muted, mirror, person }: { label: string; track?: AnyTrack | null; muted?: boolean; mirror?: boolean; person?: Person | null }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || !track) return;
    track.play(el);
    return () => { try { track.stop(); } catch { /* already closed */ } };
  }, [track]);
  return (
    <div className={`cr-tile${mirror ? " mirror" : ""}`} data-remote={label.startsWith("You") ? undefined : "1"}>
      <div className="cr-video" ref={box} />
      {!track ? (person?.avatar_url ? <span className="cr-av img"><Image src={person.avatar_url} alt="" width={72} height={72} /></span> : <span className="cr-av"><AuthorAvatar name={label} size={64} /></span>) : null}
      {!track && !label.startsWith("You") ? <span className="cr-camoff">Camera off</span> : null}
      <span className="cr-label">{label}{muted ? " · muted" : ""}</span>
    </div>
  );
}

const REACTIONS = ["❤️", "😂", "😮", "😢", "🔥", "👏"];
const PIP_MARGIN = 12;

/** The small video: drag it anywhere over the call and it settles in the nearest corner. A tap swaps. */
function DragPip({ onTap, label, children, top = 0, bottom = 0 }: { onTap: () => void; label: string; children: ReactNode; top?: number; bottom?: number }) {
  const ref = useRef<HTMLButtonElement>(null);
  const corner = useRef(3);
  const start = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inset = useRef({ top, bottom });
  inset.current = { top, bottom };

  const place = useCallback((i: number) => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    corner.current = i;
    setPos({
      x: i % 2 ? box.clientWidth - el.offsetWidth - PIP_MARGIN : PIP_MARGIN,
      y: i > 1 ? box.clientHeight - el.offsetHeight - PIP_MARGIN - inset.current.bottom : PIP_MARGIN + inset.current.top,
    });
  }, []);
  useEffect(() => { place(corner.current); }, [top, bottom, place]);

  useLayoutEffect(() => {
    place(corner.current);
    const box = ref.current?.parentElement;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => place(corner.current));
    ro.observe(box);
    return () => ro.disconnect();
  }, [place]);

  function down(e: React.PointerEvent<HTMLButtonElement>) {
    if (!pos) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y, moved: false };
  }
  function move(e: React.PointerEvent<HTMLButtonElement>) {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.px;
    const dy = e.clientY - s.py;
    if (!s.moved && Math.hypot(dx, dy) < 6) return;
    s.moved = true;
    setDragging(true);
    setPos({ x: s.x + dx, y: s.y + dy });
  }
  function up() {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (!s) return;
    if (!s.moved) { onTap(); return; }
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box || !pos) return;
    const cx = pos.x + el.offsetWidth / 2;
    const cy = pos.y + el.offsetHeight / 2;
    place((cx > box.clientWidth / 2 ? 1 : 0) + (cy > box.clientHeight / 2 ? 2 : 0));
  }

  return (
    <button
      ref={ref}
      type="button"
      className={`cr-mini cr-drag${dragging ? " dragging" : ""}`}
      style={pos ? { left: pos.x, top: pos.y } : { visibility: "hidden" }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      aria-label={label}
    >
      {children}
    </button>
  );
}

export default function CallRoom({ info, onClose }: { info: CallInfo; onClose: () => void }) {
  const [current, setCurrent] = useState(info);
  // A layer of its own over the whole page, so no page layout can squeeze it.
  if (typeof document === "undefined") return null;
  return createPortal(<CallRoomInner key={current.callId} info={current} onClose={onClose} onRedial={setCurrent} />, document.body);
}

function CallRoomInner({ info, onClose, onRedial }: { info: CallInfo; onClose: () => void; onRedial: (next: CallInfo) => void }) {
  const direct = info.kind === "direct";
  const other = info.other || (info.hostName ? { name: info.hostName } : null);
  const [phase, setPhase] = useState<"ringing" | "connecting" | "live">(info.status === "ringing" ? "ringing" : "connecting");
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");
  const [netNote, setNetNote] = useState("");
  const [micOff, setMicOff] = useState(false);
  const [camOff, setCamOff] = useState(info.audioOnly);
  const [sharing, setSharing] = useState(false);
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [localCam, setLocalCam] = useState<AnyTrack | null>(null);
  const [localScreen, setLocalScreen] = useState<AnyTrack | null>(null);
  const [cams, setCams] = useState<{ deviceId: string }[]>([]);
  const [secs, setSecs] = useState(0);
  const [people, setPeople] = useState<Participant[]>([]);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [delivered, setDelivered] = useState(info.reachable !== false);
  const [outcome, setOutcome] = useState<{ title: string; sub?: string } | null>(null);
  const [redialing, setRedialing] = useState(false);
  const [weak, setWeak] = useState({ me: false, them: false });
  const [mini, setMini] = useState(false);
  const [asking, setAsking] = useState(false);
  const [videoAsk, setVideoAsk] = useState<string | null>(null);
  const [reactOpen, setReactOpen] = useState(false);
  const [floaters, setFloaters] = useState<{ id: number; emoji: string; left: number }[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [devices, setDevices] = useState<{ mics: MediaDeviceInfo[]; outs: MediaDeviceInfo[] }>({ mics: [], outs: [] });
  const [blur, setBlur] = useState(false);
  const [blurBusy, setBlurBusy] = useState(false);
  const outputId = useRef("");
  const vb = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [chrome, setChrome] = useState(true);

  const sdk = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const client = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const mic = useRef<AnyTrack | null>(null);
  const cam = useRef<AnyTrack | null>(null);
  const screen = useRef<AnyTrack | null>(null);
  const camIdx = useRef(0);
  const ended = useRef(false);
  const reconnectTimer = useRef<number | null>(null);
  const dropTimer = useRef<number | null>(null);

  // Live = the other side is actually here (1-to-1), or we're in the session (group).
  const live = joined && (direct ? remotes.length > 0 : true);
  useEffect(() => { if (live) setPhase("live"); }, [live]);
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [live]);

  const syncRemotes = useCallback(() => {
    const c = client.current;
    if (!c) return;
    setRemotes(c.remoteUsers.map((u: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      uid: u.uid as number,
      video: u.hasVideo ? (u.videoTrack as AnyTrack) : undefined,
      muted: !u.hasAudio,
    })));
  }, []);

  const teardown = useCallback(async () => {
    try { await vb.current?.release?.(); } catch { /* not started */ }
    vb.current = null;
    if (typeof document !== "undefined" && document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    for (const t of [mic.current, cam.current, screen.current]) {
      try { t?.stop(); t?.close(); } catch { /* already closed */ }
    }
    mic.current = cam.current = screen.current = null;
    try { await client.current?.leave(); } catch { /* not joined */ }
    client.current = null;
  }, []);

  // notify: tell the server (end for host / direct, leave for guests). message: shown after.
  // outcome: an unanswered call stays on screen with "Call again", like a phone.
  const finish = useCallback(async ({ notify = true, message = "", outcome: result }: { notify?: boolean; message?: string; outcome?: { title: string; sub?: string } } = {}) => {
    if (ended.current) return;
    ended.current = true;
    if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
    if (dropTimer.current) window.clearTimeout(dropTimer.current);
    stopCallSound();
    playEndTone();
    void teardown();
    if (notify) (direct || info.isHost ? callsApi.end(info.callId) : callsApi.leave(info.callId)).catch(() => {});
    if (result) { setOutcome(result); return; }
    if (message) setNotice(message);
    window.setTimeout(onClose, message ? 1600 : 0);
  }, [direct, info.callId, info.isHost, onClose, teardown]);

  const loadPeople = useCallback(async () => {
    try {
      const d = await callsApi.details(info.callId);
      setPeople(d.participants || []);
    } catch { /* keep the last list */ }
  }, [info.callId]);
  useEffect(() => { void loadPeople(); }, [loadPeople]);

  const addFloater = useCallback((emoji: string) => {
    const id = Date.now() + Math.random();
    setFloaters((list) => [...list.slice(-12), { id, emoji, left: 10 + Math.random() * 70 }]);
    window.setTimeout(() => setFloaters((list) => list.filter((f) => f.id !== id)), 2500);
  }, []);

  // Server events for this call.
  useEffect(() => {
    const so = connectSocket();
    if (!so) return;
    const mine = (fn: () => void) => (e: { call_id?: string }) => { if (e?.call_id === info.callId) fn(); };
    so.on("call_ringing", mine(() => setDelivered(true)));
    const mineE = <T extends { call_id?: string }>(fn: (e: T) => void) => (e: T) => { if (e?.call_id === info.callId) fn(e); };
    so.on("call_video_request", mineE((e: { call_id?: string; from_name?: string }) => setVideoAsk(e.from_name || other?.name || "They")));
    so.on("call_video_reply", mineE((e: { call_id?: string; accept?: boolean }) => {
      setAsking(false);
      if (!e.accept) {
        void cam.current?.setEnabled(false);
        setCamOff(true);
        setError(`${other?.name || "They"} would rather stay on voice.`);
      }
    }));
    so.on("call_reaction", mineE((e: { call_id?: string; emoji?: string }) => { if (e.emoji) addFloater(e.emoji); }));
    so.on("call_accepted", mine(() => setPhase("connecting")));
    so.on("call_declined", mine(() => void finish({ notify: false, outcome: { title: "Can’t talk right now", sub: "They declined. Try again later or send a message." } })));
    so.on("call_missed", mine(() => void finish({ notify: false, outcome: { title: "No answer", sub: "They didn’t pick up." } })));
    so.on("call_cancelled", mine(() => void finish({ notify: false })));
    so.on("drop_call_ended", mine(() => void finish({ notify: false, message: "The call ended." })));
    so.on("drop_call_removed", mine(() => void finish({ notify: false, message: "The host took you out of the session." })));
    so.on("drop_call_mute", mine(() => {
      void mic.current?.setEnabled(false);
      setMicOff(true);
      setError("The host muted you. Click the mic to talk again.");
    }));
    so.on("drop_call_guest_joined", mine(() => void loadPeople()));
    so.on("drop_call_participants", mine(() => void loadPeople()));
    return () => { so.disconnect(); };
  }, [info.callId, finish, loadPeople, other?.name]);

  // Ringing: give up after the ring window (the server marks it missed too).
  useEffect(() => {
    if (phase !== "ringing") return;
    if (direct && delivered) startCallSound("ringback");
    const sub = delivered ? "They didn’t pick up." : "They’re offline. They’ll see you called.";
    const t = window.setTimeout(() => void finish({ outcome: { title: "No answer", sub } }), ((info.ringSeconds || 45) + 3) * 1000);
    return () => { window.clearTimeout(t); stopCallSound(); };
  }, [phase, direct, delivered, finish, info.ringSeconds]);

  async function redial() {
    if (!info.connectionId || redialing) return;
    setRedialing(true);
    try {
      const d = await callsApi.direct(info.connectionId, !info.audioOnly);
      onRedial(callInfo(d, { other: { ...(other || {}), ...(d.other || {}) }, connectionId: info.connectionId }));
    } catch (e) {
      setRedialing(false);
      setOutcome((o) => (o ? { ...o, sub: (e as Error).message || "Could not call. Try again." } : o));
    }
  }

  useEffect(() => {
    let dead = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't call. Try Chrome, Edge, Safari or Firefox.");
        return;
      }
      try {
        const mod = await import("agora-rtc-sdk-ng");
        const AgoraRTC = mod.default;
        AgoraRTC.setLogLevel(3);
        sdk.current = AgoraRTC;
        const c = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        client.current = c;

        c.on("user-published", async (user: any, type: "audio" | "video") => { // eslint-disable-line @typescript-eslint/no-explicit-any
          try {
            await c.subscribe(user, type);
            if (type === "audio") {
              user.audioTrack?.play();
              if (outputId.current) user.audioTrack?.setPlaybackDevice?.(outputId.current).catch(() => {});
            }
          } catch { /* user left mid-subscribe */ }
          syncRemotes();
        });
        c.on("user-unpublished", syncRemotes);
        c.on("user-joined", () => {
          if (dropTimer.current) window.clearTimeout(dropTimer.current);
          setNetNote("");
          syncRemotes();
          void loadPeople();
        });
        // "ServerTimeOut" = their connection dropped: wait for them to come back before ending.
        c.on("user-left", (_u: unknown, reason?: string) => {
          syncRemotes();
          if (!direct || c.remoteUsers.length > 0) return;
          if (reason === "ServerTimeOut") {
            setNetNote("Their connection dropped. Reconnecting…");
            if (dropTimer.current) window.clearTimeout(dropTimer.current);
            dropTimer.current = window.setTimeout(() => void finish({ message: "Lost them. The call ended." }), 25000);
          } else {
            void finish({ message: "The call ended." });
          }
        });
        c.on("connection-state-change", (cur: string, _prev: string, reason?: string) => {
          if (cur === "RECONNECTING") {
            setNetNote("Reconnecting…");
            if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
            reconnectTimer.current = window.setTimeout(() => void finish({ message: "Couldn’t reconnect. The call ended." }), 30000);
          } else if (cur === "CONNECTED") {
            if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
            setNetNote("");
          } else if (cur === "DISCONNECTED" && reason && reason !== "LEAVE") {
            void finish({ notify: false, message: "Lost the connection. The call ended." });
          }
        });
        // Quality 4+ is poor (Agora); checks mine and theirs every couple of seconds.
        c.on("network-quality", (q: { uplinkNetworkQuality: number; downlinkNetworkQuality: number }) => {
          const me = Math.max(q.uplinkNetworkQuality, q.downlinkNetworkQuality) >= 4;
          let them = false;
          try {
            const r = c.getRemoteNetworkQuality() as Record<string, { uplinkNetworkQuality: number; downlinkNetworkQuality: number }>;
            them = Object.values(r).some((x) => Math.max(x.uplinkNetworkQuality, x.downlinkNetworkQuality) >= 4);
          } catch { /* no one else yet */ }
          setWeak((prev) => (prev.me === me && prev.them === them ? prev : { me, them }));
        });
        c.on("token-privilege-will-expire", async () => {
          try { await c.renewToken((await callsApi.renew(info.callId)).token); } catch { /* ends when the old token runs out */ }
        });

        await c.join(info.appId, info.channel, info.token, info.uid);
        if (dead) { await teardown(); return; }

        const tracks: AnyTrack[] = [];
        try {
          mic.current = await AgoraRTC.createMicrophoneAudioTrack();
          tracks.push(mic.current);
        } catch {
          setError("Allow microphone access to be heard.");
        }
        if (!info.audioOnly) {
          try {
            cam.current = await AgoraRTC.createCameraVideoTrack();
            tracks.push(cam.current);
            setLocalCam(cam.current);
          } catch {
            setCamOff(true);
            setError("Camera is blocked, so this is voice only.");
          }
        }
        if (tracks.length) await c.publish(tracks as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        try { setCams(await AgoraRTC.getCameras()); } catch { /* no permission yet */ }
        if (!dead) setJoined(true);
      } catch (e) {
        if (!dead) setError((e as Error).message || "Could not join the call.");
      }
    })();
    return () => { dead = true; if (!ended.current) { ended.current = true; void teardown(); } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleMic() {
    const next = !micOff;
    await mic.current?.setEnabled(!next);
    setMicOff(next);
    if (!next) setError("");
  }

  async function toggleCam(ask = true) {
    const c = client.current;
    if (!c || sharing) return;
    if (camOff) {
      // A voice call: turning the camera on asks them to switch to video, like WhatsApp.
      if (ask && direct && phase === "live" && !remotes.some((r) => r.video)) {
        setAsking(true);
        callsApi.askVideo(info.callId).catch(() => setAsking(false));
      }
      try {
        if (!cam.current) {
          cam.current = await sdk.current.createCameraVideoTrack();
          setLocalCam(cam.current);
          await c.publish(cam.current as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        } else {
          await cam.current.setEnabled(true);
        }
        setCamOff(false);
        setError("");
      } catch {
        setError("Allow camera access to turn video on.");
      }
    } else {
      await cam.current?.setEnabled(false);
      setCamOff(true);
      setAsking(false);
    }
  }

  async function answerVideo(accept: boolean) {
    setVideoAsk(null);
    callsApi.replyVideo(info.callId, accept).catch(() => {});
    if (accept && camOff) await toggleCam(false);
  }

  function sendReaction(emoji: string) {
    setReactOpen(false);
    addFloater(emoji);
    callsApi.react(info.callId, emoji).catch(() => {});
  }

  // Picture in picture: their video floats over other tabs and apps.
  const canPip = typeof document !== "undefined" && !!document.pictureInPictureEnabled && remotes.some((r) => r.video);
  const togglePip = useCallback(async () => {
    try {
      if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return; }
      const v = document.querySelector<HTMLVideoElement>(".cr [data-remote] video");
      if (v) await v.requestPictureInPicture();
    } catch { /* blocked by the browser */ }
  }, []);
  useEffect(() => {
    if (!canPip || !("mediaSession" in navigator)) return;
    try { navigator.mediaSession.setActionHandler("enterpictureinpicture" as unknown as MediaSessionAction, () => void togglePip()); } catch { /* not supported */ }
    return () => { try { navigator.mediaSession.setActionHandler("enterpictureinpicture" as unknown as MediaSessionAction, null); } catch { /* not supported */ } };
  }, [canPip, togglePip]);

  async function openSettings() {
    const next = !settingsOpen;
    setSettingsOpen(next);
    if (!next || !sdk.current) return;
    try {
      const [mics, outs] = await Promise.all([
        sdk.current.getMicrophones().catch(() => []),
        sdk.current.getPlaybackDevices ? sdk.current.getPlaybackDevices().catch(() => []) : [],
      ]);
      setDevices({ mics, outs });
      setCams(await sdk.current.getCameras().catch(() => cams));
    } catch { /* no permission */ }
  }

  async function pickMic(id: string) {
    try { await mic.current?.setDevice?.(id); } catch { setError("Couldn’t switch the microphone."); }
  }

  async function pickOutput(id: string) {
    outputId.current = id;
    for (const u of client.current?.remoteUsers || []) {
      try { await u.audioTrack?.setPlaybackDevice?.(id); } catch { setError("This browser can’t switch speakers."); }
    }
  }

  async function pickCam(id: string) {
    try { await cam.current?.setDevice?.(id); } catch { setError("Couldn’t switch the camera."); }
  }

  async function toggleBlur() {
    const track = cam.current as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!track || blurBusy) return;
    setBlurBusy(true);
    try {
      if (!vb.current) {
        const { default: Extension } = await import("agora-extension-virtual-background");
        const ext = new Extension();
        if (!ext.checkCompatibility()) { setError("This browser can’t blur the background."); return; }
        sdk.current.registerExtensions([ext]);
        const processor = ext.createProcessor();
        await processor.init();
        track.pipe(processor).pipe(track.processorDestination);
        vb.current = processor;
      }
      if (blur) {
        await vb.current.disable();
        setBlur(false);
      } else {
        vb.current.setOptions({ type: "blur", blurDegree: 2 });
        await vb.current.enable();
        setBlur(true);
      }
    } catch {
      setError("Couldn’t blur the background.");
    } finally {
      setBlurBusy(false);
    }
  }

  async function flip() {
    if (!cam.current?.setDevice || cams.length < 2) return;
    camIdx.current = (camIdx.current + 1) % cams.length;
    try { await cam.current.setDevice(cams[camIdx.current].deviceId); } catch { /* device busy */ }
  }

  async function toggleShare() {
    const c = client.current;
    if (!c) return;
    try {
      if (!sharing) {
        const s = await sdk.current.createScreenVideoTrack({}, "disable");
        if (cam.current) await c.unpublish(cam.current as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        screen.current = s;
        s.on("track-ended", () => { void stopShare(); });
        await c.publish(s);
        setLocalScreen(s);
        setSharing(true);
      } else {
        await stopShare();
      }
    } catch {
      setError("Screen sharing was cancelled or isn't available here.");
    }
  }

  async function stopShare() {
    const c = client.current;
    const s = screen.current;
    if (!c || !s) return;
    screen.current = null;
    setLocalScreen(null);
    setSharing(false);
    try { await c.unpublish(s as any); s.stop(); s.close(); } catch { /* already gone */ } // eslint-disable-line @typescript-eslint/no-explicit-any
    if (cam.current && !camOff) { try { await c.publish(cam.current as any); } catch { /* ignore */ } } // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  async function hostAction(p: Participant, action: "mute" | "remove") {
    try {
      if (action === "mute") { await callsApi.mute(info.callId, p.user_id); setError(`Muted ${p.name}.`); }
      else { await callsApi.remove(info.callId, p.user_id); setError(`${p.name} left the session. Still in your Room.`); void loadPeople(); }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const canShare = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const h = Math.floor(secs / 3600);
  const clock = `${h ? `${h}:` : ""}${String(Math.floor((secs % 3600) / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
  const personFor = useCallback((uid: number) => people.find((p) => p.uid === uid) || (direct ? other : null), [people, direct, other]);

  const tiles = useMemo(() => {
    const list: { key: string; label: string; track?: AnyTrack | null; muted?: boolean; mirror?: boolean; person?: Person | null }[] = [
      { key: "me", label: info.isHost && !direct ? "You (host)" : "You", track: localScreen || (camOff ? null : localCam), muted: micOff, mirror: !localScreen },
    ];
    remotes.forEach((r, i) => {
      const p = personFor(r.uid);
      list.push({ key: String(r.uid), label: p?.name || `Guest ${i + 1}`, track: r.video, muted: r.muted, person: p });
    });
    return list;
  }, [remotes, localCam, localScreen, camOff, micOff, info.isHost, direct, personFor]);

  const anyVideo = !!(localScreen || (!camOff && localCam)) || remotes.some((r) => r.video);
  const stage = direct && (phase === "ringing" || !anyVideo || remotes.length === 0);
  const cols = tiles.length <= 1 ? 1 : tiles.length <= 4 ? 2 : tiles.length <= 9 ? 3 : 4;
  // 1-to-1: the other person fills the screen and you sit in the corner; tap the corner to swap.
  // Group: tap anyone to make them full screen, tap again to go back to the grid.
  const mainKey = tiles.some((t) => t.key === focusKey) ? focusKey : direct ? tiles.find((t) => t.key !== "me")?.key ?? null : null;
  const main = !stage && mainKey ? tiles.find((t) => t.key === mainKey) : undefined;
  const side = main ? tiles.filter((t) => t.key !== mainKey) : [];
  const tp = (t: (typeof tiles)[number]) => ({ label: t.label, track: t.track, muted: t.muted, mirror: t.mirror, person: t.person });
  const onMain = () => (direct ? setChrome((v) => !v) : setFocusKey(null));
  // Video fills the screen; the controls fade out after a few seconds and a tap brings them back.
  const videoMode = direct && !!main;
  const hidden = videoMode && !chrome;
  const menuOpen = reactOpen || settingsOpen || !!videoAsk;
  useEffect(() => {
    if (!videoMode || !chrome || phase !== "live" || menuOpen) return;
    const t = window.setTimeout(() => setChrome(false), 4000);
    return () => window.clearTimeout(t);
  }, [videoMode, chrome, phase, menuOpen]);
  useEffect(() => { if (!videoMode) setChrome(true); }, [videoMode]);
  useEffect(() => {
    if (mini) exitCallFullscreen(); else enterCallFullscreen();
  }, [mini]);
  useEffect(() => () => exitCallFullscreen(), []);
  const ringLabel = delivered ? "Ringing…" : "Calling…";
  const status = notice || (phase === "ringing" ? ringLabel : !live ? (direct ? "Connecting…" : "Opening the session…") : netNote || clock);
  const weakNote = phase === "live" && !netNote
    ? weak.me ? "Your connection is weak" : weak.them ? `${other?.name ? `${other.name}’s` : "Their"} connection is weak` : ""
    : "";

  if (mini && !outcome) {
    return (
      <div className="cr-float" role="dialog" aria-label={`Call with ${other?.name || "Anonymous"}`}>
        <Ava p={other} size={40} />
        <span className="cr-float-t">
          <b>{other?.name || "Anonymous"}</b>
          <small>{status}</small>
        </span>
        <button type="button" onClick={() => setMini(false)} aria-label="Back to the call"><Maximize2 {...ico} /></button>
        <button type="button" className="end" onClick={() => void finish()} aria-label="End call"><EndI /></button>
      </div>
    );
  }

  if (outcome) {
    return (
      <div className="cr full" role="dialog" aria-modal aria-label={`Call with ${other?.name || "Anonymous"}`}>
        <Backdrop p={other} />
        <div className="cr-stage">
          <Ava p={other} size={112} />
          <b>{other?.name || "Anonymous"}</b>
          <strong className="cr-out-t">{outcome.title}</strong>
          {outcome.sub ? <small>{outcome.sub}</small> : null}
        </div>
        <div className="cr-out">
          <span>
            <button type="button" className="cr-out-close" onClick={onClose} aria-label="Close"><X {...ico} /></button>
            Close
          </span>
          {info.connectionId ? (
            <span>
              <button type="button" className="cr-out-call" onClick={() => void redial()} disabled={redialing} aria-label="Call again">
                {info.audioOnly ? <Phone {...ico} /> : <Video {...ico} />}
              </button>
              {redialing ? "Calling…" : "Call again"}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  const centerName = (
    <div className="cr-center">
      <span className={`cr-ring${phase === "ringing" ? " on" : ""}`}><Ava p={other} size={112} /></span>
      <b>{other?.name || "Anonymous"}</b>
      <small>{phase === "ringing" ? ringLabel : status}</small>
      {phase === "ringing" && !delivered ? <small className="cr-hint">They’re offline. They’ll get a notification.</small> : null}
      {phase === "live" && remotes.some((r) => r.muted) ? <span className="cr-muted"><MicOff {...ico} />{other?.name || "They"} muted</span> : null}
    </div>
  );

  return (
    <div className={`cr${direct ? " full" : ""}${hidden ? " hide" : ""}`} role="dialog" aria-modal aria-label={direct ? `Call with ${other?.name || "Anonymous"}` : "Session"}>
      {netNote || weakNote ? (
        <div className="cr-net" role="status">{netNote ? <WifiOff {...ico} /> : <Wifi {...ico} />}{netNote || weakNote}</div>
      ) : null}

      {stage ? (
        <div className="cr-bg">
          {localCam && !camOff ? <Tile label="You" track={localScreen || localCam} mirror={!localScreen} /> : <Backdrop p={other} />}
          {centerName}
        </div>
      ) : main ? (
        <div className="cr-focus">
          <button type="button" className="cr-main" onClick={onMain} aria-label={direct ? "Show or hide controls" : "Back to everyone"}>
            <Tile key={`main-${main.key}`} {...tp(main)} />
          </button>
          {direct ? (
            side[0] ? (
              <DragPip onTap={() => setFocusKey(side[0].key)} label="Drag to move, tap to swap videos" top={hidden ? 16 : 76} bottom={hidden ? 16 : 132}>
                <Tile key={`pip-${side[0].key}`} {...tp(side[0])} />
              </DragPip>
            ) : null
          ) : (
            <div className="cr-strip">
              {side.map((t) => (
                <button key={t.key} type="button" className="cr-mini" onClick={() => setFocusKey(t.key)} aria-label={`Show ${t.label} full screen`}>
                  <Tile {...tp(t)} />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="cr-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {tiles.map((t) => (
            <button key={t.key} type="button" className="cr-cell" onClick={() => setFocusKey(t.key)} aria-label={`Show ${t.label} full screen`}>
              <Tile {...tp(t)} />
            </button>
          ))}
        </div>
      )}

      <div className="cr-head cr-top">
        {direct && phase !== "ringing" ? (
          <button type="button" className="cr-hbtn left" onClick={() => setMini(true)} aria-label="Minimise call"><Minimize2 {...ico} /></button>
        ) : null}
        {direct && phase === "live" ? (
          <button type="button" className={`cr-hbtn right${reactOpen ? " on" : ""}`} onClick={() => setReactOpen((v) => !v)} aria-label="Send a reaction"><Smile {...ico} /></button>
        ) : null}
        {stage ? <span className="cr-head-t" /> : (
          <span className="cr-head-t">
            <b>{direct ? other?.name || "Anonymous" : info.isHost ? "Your session" : `${other?.name || "Room"} session`}</b>
            <small className={netNote ? "warn" : ""}>{direct ? status : `${tiles.length} here · ${status}`}</small>
          </span>
        )}
        {!direct ? (
          <button className="cr-people" onClick={() => setPeopleOpen((v) => !v)} aria-expanded={peopleOpen} aria-label="People in this session">
            <PeopleI /> {Math.max(people.length, tiles.length)}
          </button>
        ) : null}
      </div>

      {peopleOpen && !direct ? (
        <div className="cr-panel" role="region" aria-label="In this session">
          {people.length === 0 ? <small>Waiting for people to join…</small> : people.map((p) => (
            <div className="cr-person" key={p.user_id}>
              <Ava p={p} size={36} />
              <span><b>{p.name}{p.is_host ? " · host" : ""}</b></span>
              {info.isHost && !p.is_host ? (
                <>
                  <button onClick={() => hostAction(p, "mute")} aria-label={`Mute ${p.name}`}><MicI off /></button>
                  <button className="danger" onClick={() => hostAction(p, "remove")}>Remove</button>
                </>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="cr-floaters" aria-hidden>
        {floaters.map((f) => <span key={f.id} style={{ left: `${f.left}%` }}>{f.emoji}</span>)}
      </div>
      {asking ? <div className="cr-asking" role="status"><Video {...ico} />Asking {other?.name || "them"} to switch to video…</div> : null}
      {videoAsk ? (
        <div className="cr-ask" role="alertdialog" aria-label="Switch to video?">
          <b>{videoAsk} wants to switch to video</b>
          <div>
            <button type="button" onClick={() => void answerVideo(false)}>Not now</button>
            <button type="button" className="yes" onClick={() => void answerVideo(true)}><Video {...ico} />Switch</button>
          </div>
        </div>
      ) : null}

      <div className="cr-bottom">
        {error ? <p className="cr-err">{error}</p> : null}
        {settingsOpen ? (
          <div className="cr-settings" role="region" aria-label="Call settings">
            {devices.mics.length ? (
              <label>Microphone
                <select onChange={(e) => void pickMic(e.target.value)} defaultValue="">
                  <option value="" disabled>Choose…</option>
                  {devices.mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Microphone"}</option>)}
                </select>
              </label>
            ) : null}
            {devices.outs.length ? (
              <label>Speaker
                <select onChange={(e) => void pickOutput(e.target.value)} defaultValue="">
                  <option value="" disabled>Choose…</option>
                  {devices.outs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Speaker"}</option>)}
                </select>
              </label>
            ) : null}
            {cams.length > 1 ? (
              <label>Camera
                <select onChange={(e) => void pickCam(e.target.value)} defaultValue="">
                  <option value="" disabled>Choose…</option>
                  {cams.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{(d as { label?: string }).label || `Camera ${i + 1}`}</option>)}
                </select>
              </label>
            ) : null}
            {localCam && !camOff ? (
              <button type="button" className={blur ? "on" : ""} onClick={() => void toggleBlur()} disabled={blurBusy}>
                {blurBusy ? "Working…" : blur ? "Stop blurring background" : "Blur background"}
              </button>
            ) : null}
          </div>
        ) : null}
        {reactOpen ? (
          <div className="cr-react">
            {REACTIONS.map((e) => <button key={e} type="button" onClick={() => sendReaction(e)} aria-label={`React ${e}`}>{e}</button>)}
          </div>
        ) : null}
        <div className="cr-ctrls">
          {cams.length > 1 ? <button onClick={flip} aria-label="Switch camera"><FlipI /></button> : null}
          <button className={camOff ? "on" : ""} onClick={() => void toggleCam()} disabled={sharing} aria-label={camOff ? "Turn camera on" : "Turn camera off"}><CamI off={camOff} /></button>
          <button className={micOff ? "on" : ""} onClick={toggleMic} aria-label={micOff ? "Unmute" : "Mute"}><MicI off={micOff} /></button>
          {canShare && phase !== "ringing" ? <button className={sharing ? "on" : ""} onClick={toggleShare} aria-label={sharing ? "Stop sharing" : "Share screen"}><ScreenI off={sharing} /></button> : null}
          {canPip ? <button onClick={() => void togglePip()} aria-label="Picture in picture"><PictureInPicture2 {...ico} /></button> : null}
          <button className={settingsOpen ? "set on" : "set"} onClick={() => void openSettings()} aria-label="Call settings" aria-expanded={settingsOpen}><Settings2 {...ico} /></button>
          <button className="end" onClick={() => void finish()} aria-label={direct ? "End call" : info.isHost ? "End session for everyone" : "Leave session"}><EndI /></button>
        </div>
        {direct ? null : (
          <p className="cr-note">{info.isHost ? "Ends it for everyone. Nobody leaves your Room." : "Leaving the session keeps you in the Room."}</p>
        )}
      </div>
    </div>
  );
}
