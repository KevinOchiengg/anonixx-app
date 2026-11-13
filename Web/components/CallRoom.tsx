"use client";
/** A Room call on Agora (web SDK). Same rules as the app's DropCallScreen:
 * kind "direct": 1-to-1. The caller arrives "ringing" and is already in the channel, so audio
 *   connects the moment they accept; declined / missed / no answer close it. Either side ends it.
 * kind "group": a session in the owner's Room. The host sees who's in and can mute or remove
 *   someone, and ends it for all; guests leave.
 * Leaving a call never touches the Room conversation. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { connectSocket } from "@/lib/socket";
import { callsApi, type Participant, type Person } from "@/lib/calls";
import { Mic, MicOff, PhoneOff, ScreenShare, ScreenShareOff, SwitchCamera, Users, Video, VideoOff } from "lucide-react";

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

function Ava({ p, size }: { p?: Person | null; size: number }) {
  const name = p?.name || "A";
  return (
    <span className="cr-bigava" style={{ width: size, height: size }}>
      {p?.avatar_url ? <Image src={p.avatar_url} alt="" width={size} height={size} /> : name[0].toUpperCase()}
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
    <div className={`cr-tile${mirror ? " mirror" : ""}`}>
      <div className="cr-video" ref={box} />
      {!track ? (person?.avatar_url ? <span className="cr-av img"><Image src={person.avatar_url} alt="" width={72} height={72} /></span> : <span className="cr-av">{label[0]?.toUpperCase() || "A"}</span>) : null}
      <span className="cr-label">{label}{muted ? " · muted" : ""}</span>
    </div>
  );
}

export default function CallRoom({ info, onClose }: { info: CallInfo; onClose: () => void }) {
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

  const sdk = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const client = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const mic = useRef<AnyTrack | null>(null);
  const cam = useRef<AnyTrack | null>(null);
  const screen = useRef<AnyTrack | null>(null);
  const camIdx = useRef(0);
  const ended = useRef(false);

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
    for (const t of [mic.current, cam.current, screen.current]) {
      try { t?.stop(); t?.close(); } catch { /* already closed */ }
    }
    mic.current = cam.current = screen.current = null;
    try { await client.current?.leave(); } catch { /* not joined */ }
    client.current = null;
  }, []);

  // notify: tell the server (end for host / direct, leave for guests). message: shown after.
  const finish = useCallback(async ({ notify = true, message = "" }: { notify?: boolean; message?: string } = {}) => {
    if (ended.current) return;
    ended.current = true;
    await teardown();
    if (notify) {
      try { await (direct || info.isHost ? callsApi.end(info.callId) : callsApi.leave(info.callId)); } catch { /* already closed */ }
    }
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

  // Server events for this call.
  useEffect(() => {
    const so = connectSocket();
    if (!so) return;
    const mine = (fn: () => void) => (e: { call_id?: string }) => { if (e?.call_id === info.callId) fn(); };
    so.on("call_accepted", mine(() => setPhase("connecting")));
    so.on("call_declined", mine(() => void finish({ notify: false, message: `${other?.name || "They"} can't talk right now.` })));
    so.on("call_missed", mine(() => void finish({ notify: false, message: `${other?.name || "They"} didn't answer.` })));
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
    const t = window.setTimeout(() => void finish({ message: `${other?.name || "They"} didn't answer.` }), ((info.ringSeconds || 45) + 3) * 1000);
    return () => window.clearTimeout(t);
  }, [phase, finish, info.ringSeconds, other?.name]);

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
            if (type === "audio") user.audioTrack?.play();
          } catch { /* user left mid-subscribe */ }
          syncRemotes();
        });
        c.on("user-unpublished", syncRemotes);
        c.on("user-joined", () => { syncRemotes(); void loadPeople(); });
        c.on("user-left", () => {
          syncRemotes();
          // A 1-to-1 call is over when the other person drops out.
          if (direct && c.remoteUsers.length === 0) void finish({ message: "The call ended." });
        });
        c.on("connection-state-change", (cur: string, _prev: string, reason?: string) => {
          if (cur === "RECONNECTING") setNetNote("Reconnecting…");
          else if (cur === "CONNECTED") setNetNote("");
          else if (cur === "DISCONNECTED" && reason && reason !== "LEAVE") void finish({ notify: false, message: "Lost the connection. The call ended." });
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

  async function toggleCam() {
    const c = client.current;
    if (!c || sharing) return;
    if (camOff) {
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
  const status = notice || (phase === "ringing" ? "Ringing…" : !live ? (direct ? "Connecting…" : "Opening the session…") : netNote || clock);

  return (
    <div className="cr" role="dialog" aria-modal aria-label={direct ? `Call with ${other?.name || "Anonymous"}` : "Session"}>
      <div className="cr-head">
        <span className="cr-head-t">
          <b>{direct ? other?.name || "Anonymous" : info.isHost ? "Your session" : `${other?.name || "Room"} session`}</b>
          <small className={netNote ? "warn" : ""}>{direct ? `${info.audioOnly ? "Voice" : "Video"} call · ${status}` : `${tiles.length} here · ${status}`}</small>
        </span>
        {!direct ? (
          <button className="cr-people" onClick={() => setPeopleOpen((v) => !v)} aria-expanded={peopleOpen} aria-label="People in this session">
            <PeopleI /> {Math.max(people.length, tiles.length)}
          </button>
        ) : null}
      </div>

      {stage ? (
        <div className="cr-stage">
          <span className={`cr-ring${phase === "ringing" ? " on" : ""}`}><Ava p={other} size={124} /></span>
          <b>{other?.name || "Anonymous"}</b>
          <small>{phase === "ringing" ? "Calling… they'll see it's you" : status}</small>
          {localCam && !camOff ? <div className="cr-pip"><Tile label="You" track={localScreen || localCam} mirror={!localScreen} /></div> : null}
        </div>
      ) : (
        <div className="cr-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {tiles.map((t) => <Tile key={t.key} label={t.label} track={t.track} muted={t.muted} mirror={t.mirror} person={t.person} />)}
        </div>
      )}

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

      {error ? <p className="cr-err">{error}</p> : null}
      <div className="cr-ctrls">
        <button className={micOff ? "on" : ""} onClick={toggleMic} aria-label={micOff ? "Unmute" : "Mute"}><MicI off={micOff} /></button>
        <button className={camOff ? "on" : ""} onClick={toggleCam} disabled={sharing} aria-label={camOff ? "Turn camera on" : "Turn camera off"}><CamI off={camOff} /></button>
        <button className="end" onClick={() => void finish()} aria-label={direct ? "End call" : info.isHost ? "End session for everyone" : "Leave session"}><EndI /></button>
        {canShare && phase !== "ringing" ? <button className={sharing ? "on" : ""} onClick={toggleShare} aria-label={sharing ? "Stop sharing" : "Share screen"}><ScreenI off={sharing} /></button> : null}
        {cams.length > 1 ? <button onClick={flip} aria-label="Switch camera"><FlipI /></button> : null}
      </div>
      <p className="cr-note">
        {direct ? "Ends the call. The chat stays open."
          : info.isHost ? "Ends it for everyone. Nobody leaves your Room."
            : "Leaving the session keeps you in the Room."}
      </p>
    </div>
  );
}
