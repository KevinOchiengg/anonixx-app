"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";

export type CallInfo = {
  callId: string;
  channel: string;
  token: string;
  uid: number;
  appId: string;
  isHost: boolean;
  audioOnly: boolean;
  hostName?: string;
};

type AnyTrack = {
  play: (el: HTMLElement | string) => void;
  stop: () => void;
  close: () => void;
  setEnabled: (on: boolean) => Promise<void>;
  setDevice?: (id: string) => Promise<void>;
};
type Remote = { uid: number; video?: AnyTrack; muted: boolean };

const ico = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const MicI = ({ off }: { off?: boolean }) => (
  <svg {...ico}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />{off ? <path d="M3 3l18 18" /> : null}</svg>
);
const CamI = ({ off }: { off?: boolean }) => (
  <svg {...ico}><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M16 10l6-3v10l-6-3" />{off ? <path d="M3 3l18 18" /> : null}</svg>
);
const ScreenI = ({ off }: { off?: boolean }) => (
  <svg {...ico}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" />{off ? <path d="M3 3l18 18" /> : null}</svg>
);
const FlipI = () => (
  <svg {...ico}><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" /></svg>
);
const EndI = () => (
  <svg {...ico}><path d="M3 14c5-5 13-5 18 0l-3 3-3-2v-3a12 12 0 0 0-6 0v3l-3 2z" /></svg>
);

function Tile({ label, track, muted, mirror }: { label: string; track?: AnyTrack | null; muted?: boolean; mirror?: boolean }) {
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
      {!track ? <span className="cr-av">{label[0]?.toUpperCase() || "A"}</span> : null}
      <span className="cr-label">{label}{muted ? " · muted" : ""}</span>
    </div>
  );
}

export default function CallRoom({ info, onClose }: { info: CallInfo; onClose: () => void }) {
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");
  const [micOff, setMicOff] = useState(false);
  const [camOff, setCamOff] = useState(info.audioOnly);
  const [sharing, setSharing] = useState(false);
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [localCam, setLocalCam] = useState<AnyTrack | null>(null);
  const [localScreen, setLocalScreen] = useState<AnyTrack | null>(null);
  const [cams, setCams] = useState<{ deviceId: string }[]>([]);
  const [secs, setSecs] = useState(0);

  const sdk = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const client = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const mic = useRef<AnyTrack | null>(null);
  const cam = useRef<AnyTrack | null>(null);
  const screen = useRef<AnyTrack | null>(null);
  const camIdx = useRef(0);
  const ended = useRef(false);

  useEffect(() => {
    if (!joined) return;
    const t = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [joined]);

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

  const hangUp = useCallback(async () => {
    if (ended.current) return;
    ended.current = true;
    await teardown();
    try {
      await api(`/drop-calls/${info.callId}/${info.isHost ? "end" : "leave"}`, { method: "POST" });
    } catch { /* the room may already be closed */ }
    onClose();
  }, [info.callId, info.isHost, onClose, teardown]);

  useEffect(() => {
    let dead = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't do calls. Try Chrome, Edge, Safari or Firefox over https.");
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
        c.on("user-joined", syncRemotes);
        c.on("user-left", syncRemotes);

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
            setError("Camera is blocked. You are joining with audio only.");
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

  const canShare = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  const tiles = useMemo(() => {
    const list: { key: string; label: string; track?: AnyTrack | null; muted?: boolean; mirror?: boolean }[] = [
      { key: "me", label: info.isHost ? "You (host)" : "You", track: localScreen || (camOff ? null : localCam), muted: micOff, mirror: !localScreen },
    ];
    remotes.forEach((r, i) => list.push({
      key: String(r.uid),
      label: info.isHost ? `Guest ${i + 1}` : i === 0 ? info.hostName || "Host" : `Guest ${i + 1}`,
      track: r.video,
      muted: r.muted,
    }));
    return list;
  }, [remotes, localCam, localScreen, camOff, micOff, info.isHost, info.hostName]);

  const cols = tiles.length <= 1 ? 1 : tiles.length <= 4 ? 2 : tiles.length <= 9 ? 3 : 4;

  return (
    <div className="cr" role="dialog" aria-modal aria-label="Call">
      <div className="cr-head">
        <b>{joined ? `${mm}:${ss}` : error && !joined ? "Couldn't connect" : "connecting…"}</b>
        <small>{tiles.length} in the room</small>
      </div>
      <div className="cr-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {tiles.map((t) => <Tile key={t.key} label={t.label} track={t.track} muted={t.muted} mirror={t.mirror} />)}
      </div>
      {error ? <p className="cr-err">{error}</p> : null}
      <div className="cr-ctrls">
        <button className={micOff ? "on" : ""} onClick={toggleMic} aria-label={micOff ? "Unmute" : "Mute"}><MicI off={micOff} /></button>
        <button className={camOff ? "on" : ""} onClick={toggleCam} disabled={sharing} aria-label={camOff ? "Turn camera on" : "Turn camera off"}><CamI off={camOff} /></button>
        <button className="end" onClick={hangUp} aria-label={info.isHost ? "End call for everyone" : "Leave call"}><EndI /></button>
        {canShare ? <button className={sharing ? "on" : ""} onClick={toggleShare} aria-label={sharing ? "Stop sharing" : "Share screen"}><ScreenI off={sharing} /></button> : null}
        {cams.length > 1 ? <button onClick={flip} aria-label="Switch camera"><FlipI /></button> : null}
      </div>
      {info.isHost ? <p className="cr-note">Ending the call closes it for everyone in the room.</p> : null}
    </div>
  );
}
