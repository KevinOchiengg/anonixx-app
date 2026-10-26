"use client";
import { useEffect, useRef, useState } from "react";
import useDraft from "@/lib/useDraft";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, COST, type Post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { uploadFile } from "@/lib/upload";
import { INTENTS, MAX_INTENTS, MAX_PITCH } from "@/lib/linkup";
import AgeGate from "./AgeGate";
import Sheet from "./Sheet";
import VoiceRecorder, { type VoiceDraft } from "./compose/VoiceRecorder";

const MAX_CLUE_VIDEO_SECONDS = 30;
const MAX_PEEK = 3;

// The host's door rule (Backend unlock_requests.py DOOR_COPY / door_for).
type Door = { door_rule: "line" | "line_peek" | "voice"; door_copy: string; min_pitch: number; voice_seconds: [number, number];
  my_room: { media_url: string; media_type: string }[] };

type Clue = { file: File; kind: "image" | "video"; url: string; seconds: number };

function videoSeconds(url: string): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve(v.duration || 0);
    v.onerror = () => resolve(0);
    v.src = url;
  });
}

export default function LinkUpSheet({
  post, onClose, onDone, viaProfile,
}: {
  post: Pick<Post, "id" | "anonymous_name" | "avatar_url" | "content">;
  onClose: () => void;
  /** When set (the Room), a sent link up closes the sheet and hands back instead of showing the sent screen. */
  onDone?: () => void;
  /** Sent from the poster's Room or profile, the only way to link up on a regular confession. */
  viaProfile?: boolean;
}) {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Long confessions open at 6 lines; "Read all" shows the whole thing.
  const [fullText, setFullText] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [clue, setClue] = useState<Clue | null>(null);
  const [pitch, setPitch, clearPitch] = useDraft(`linkup:${post.id}`, "");
  const [intents, setIntents] = useState<string[]>([]);
  const [ageGate, setAgeGate] = useState(false);
  const [door, setDoor] = useState<Door | null>(null);
  const [peek, setPeek] = useState<string[]>([]);
  const [voice, setVoice] = useState<VoiceDraft>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const balance = user?.coin_balance ?? 0;
  const canAfford = balance >= COST.linkUp || !!user?.is_premium;
  const name = post.anonymous_name || "Anonymous";

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    api<Door>(`/unlock-requests/door/${post.id}`).then(setDoor).catch(() => {});
  }, [post.id]);

  // What this door still needs before the Knock can go.
  const rule = door?.door_rule || "line_peek";
  const minPitch = door?.min_pitch ?? 3;
  const hasLine = pitch.trim().length >= minPitch;
  const voiceOk = !!voice && voice.seconds >= (door?.voice_seconds?.[0] ?? 2);
  const hasPeek = peek.length > 0 || !!clue || voiceOk;
  const missing = rule === "voice" ? (voiceOk ? "" : "a voice note")
    : rule === "line_peek" ? [!hasLine && "a line", !hasPeek && "a peek"].filter(Boolean).join(" and ")
    : hasLine ? "" : "a line";
  const togglePeek = (url: string) =>
    setPeek((cur) => (cur.includes(url) ? cur.filter((x) => x !== url) : cur.length >= MAX_PEEK ? cur : [...cur, url]));
  useEffect(() => () => { if (clue) URL.revokeObjectURL(clue.url); }, [clue]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
    if (!kind) { setError("Pick a photo or a short video."); return; }
    const url = URL.createObjectURL(file);
    let seconds = 0;
    if (kind === "video") {
      seconds = await videoSeconds(url);
      if (seconds > MAX_CLUE_VIDEO_SECONDS) {
        URL.revokeObjectURL(url);
        setError(`Keep the video under ${MAX_CLUE_VIDEO_SECONDS}s.`);
        return;
      }
    }
    setError("");
    setClue({ file, kind, url, seconds });
  }

  const toggleIntent = (id: string) =>
    setIntents((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_INTENTS ? cur : [...cur, id]));

  async function go() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = { target_type: "drop", target_id: post.id, payment_method: "coins" };
      if (viaProfile) body.via_profile = true;
      if (pitch.trim()) body.pitch = pitch.trim();
      if (intents.length) body.intents = intents;
      if (peek.length) body.peek_urls = peek;
      if (voiceOk && voice) {
        try {
          body.voice_url = await uploadFile(voice.blob, "voice");
        } catch {
          setError("Could not upload your voice note. Try again.");
          setBusy(false);
          return;
        }
        body.voice_duration = Math.round(voice.seconds * 10) / 10;
      }
      if (clue) {
        try {
          body.media_url = await uploadFile(clue.file, clue.kind);
        } catch {
          setError("Could not upload your clue. Try again.");
          setBusy(false);
          return;
        }
        body.media_type = clue.kind;
        if (clue.kind === "video") body.media_duration = clue.seconds;
      }
      const r = await api<{ already_unlocked?: boolean; mutual?: boolean; connection_id?: string }>("/unlock-requests", { body });
      clearPitch();
      if ((r.already_unlocked || r.mutual) && r.connection_id) {
        router.push(`/chat/${r.connection_id}`);
        return;
      }
      refresh();
      if (onDone) { onDone(); onClose(); return; }
      setSent(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === "age_verification_required") { setAgeGate(true); return; }
      setError(e instanceof ApiError && e.status === 402 ? "You need enough coins ready in case they let you in. Top up first." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const finish = () => {
    onClose();
    router.push("/inbox?tab=sent");
  };

  if (sent) {
    return (
      <Sheet onClose={finish}>
        <div className="u-wait">
          <div className="u-pulse" />
          <h3>You knocked.</h3>
          <p className="u-copy">
            {post.anonymous_name || "They"} decides whether to let you in. Nothing&apos;s charged unless they do.
          </p>
          <button className="u-cta" onClick={finish}>See my knocks</button>
          <button className="u-link-btn" onClick={() => { onClose(); router.push("/"); }}>Back to feed</button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose}>
      <div className="u-link">
        <div className="u-avatar">
          {post.avatar_url ? <Image src={post.avatar_url} alt="" width={56} height={56} /> : name[0]?.toUpperCase() || "A"}
        </div>
        <h3 className="u-name">Knock on {name}&apos;s door</h3>
        {post.content ? (
          <>
            <p className={`u-quote${fullText ? " full" : ""}`}>&ldquo;{post.content}&rdquo;</p>
            {post.content.length > 220 ? (
              <button type="button" className="u-readall" onClick={() => setFullText((v) => !v)}>{fullText ? "Show less" : "Read all"}</button>
            ) : null}
          </>
        ) : null}
        {ageGate ? <AgeGate compact onDone={() => setAgeGate(false)} /> : null}
        <div className="lu-pitch">
          {door ? <p className="lu-door">{door.door_copy}</p> : null}
          <label htmlFor="lu-pitch">{rule === "voice" ? "A line (optional)" : "Your line"}</label>
          <textarea
            id="lu-pitch"
            value={pitch}
            onChange={(e) => setPitch(e.target.value.slice(0, MAX_PITCH))}
            placeholder="Make them want to let you in…"
            rows={2}
          />
          <small>{pitch.length}/{MAX_PITCH} · no numbers or handles, save that for inside</small>
          <div className="lu-chips">
            {INTENTS.map((i) => (
              <button type="button" key={i.id} className={intents.includes(i.id) ? "on" : ""} onClick={() => toggleIntent(i.id)}>
                {i.label}
              </button>
            ))}
          </div>
        </div>

        {rule !== "line" || (door?.my_room.length ?? 0) > 0 ? (
          <div className="lu-peek">
            <label>Show a peek <small>{rule === "line_peek" ? "pick from your Room, or add a photo or voice note below" : "optional"}</small></label>
            {door && door.my_room.length ? (
              <div className="lu-peek-grid">
                {door.my_room.map((g) => (
                  <button type="button" key={g.media_url} className={peek.includes(g.media_url) ? "on" : ""} onClick={() => togglePeek(g.media_url)}
                    aria-pressed={peek.includes(g.media_url)} aria-label={g.media_type === "video" ? "Video from your Room" : "Photo from your Room"}>
                    {g.media_type === "video" ? <video src={g.media_url} muted playsInline preload="metadata" /> : <img src={g.media_url} alt="" />}
                    {peek.includes(g.media_url) ? <span className="lu-peek-on">✓</span> : null}
                  </button>
                ))}
              </div>
            ) : (
              <p className="u-hint">Your Room has no photos yet. <Link href="/chat-setup?tab=room">Add some</Link>, or attach one below.</p>
            )}
            <small className="u-hint">Only {name} sees what you pick, even if your Room is private. It arrives blurred until they tap, and disappears if they say no.</small>
          </div>
        ) : null}

        <div className="u-clue">
          <input ref={fileInput} type="file" accept="image/*,video/*" hidden onChange={pick} />
          {clue ? (
            <div className="u-clue-prev">
              {clue.kind === "video" ? <video src={clue.url} muted playsInline preload="metadata" /> : <img src={clue.url} alt="" />}
              {clue.kind === "video" ? <span className="u-clue-play">▶</span> : null}
              <button type="button" className="u-clue-x" onClick={() => setClue(null)} aria-label="Remove">×</button>
            </div>
          ) : (
            <button type="button" className="u-clue-add" onClick={() => fileInput.current?.click()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
              {rule === "line_peek" && !peek.length ? "Or add a photo or short clip" : "Add a photo or short clip (optional)"}
            </button>
          )}
          <p className="u-hint">A clue of who&apos;s asking. Keep it decent, reported clues get accounts restricted.</p>
        </div>

        <div className="lu-voice">
          <label>{rule === "voice" ? "Your voice note" : "Or say it"} <small>5 to 15 seconds{rule === "voice" ? "" : ", optional"}</small></label>
          <VoiceRecorder value={voice} onChange={setVoice} onError={setError} maxSeconds={15} />
        </div>

        <div className="u-price">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 1-3s1 2 2 2c0-3 2-5 2-8z" /></svg>
          {COST.linkUp} coins, only if they let you in
        </div>
        <div className="u-bal">Your balance: {balance} coin{balance === 1 ? "" : "s"}</div>

        {error ? <div className="err">{error}</div> : null}

        {canAfford ? (
          <>
            {missing ? <p className="u-note lu-missing">This door needs {missing} first.</p> : null}
            <button className="u-cta" onClick={go} disabled={busy || !!missing}>{busy ? "Knocking…" : "Knock"}</button>
            <p className="u-note">Free to knock. If {name} lets you in, {COST.linkUp} coins leave your wallet automatically. Free if they already knocked on yours.</p>
          </>
        ) : (
          <>
            <p className="u-note">Knocking is free, but you need {COST.linkUp} coins ready in case they let you in.</p>
            <Link href="/coins" className="u-cta alt">Top up your coins</Link>
          </>
        )}
        <button className="u-link-btn" onClick={onClose}>Not now</button>
      </div>
    </Sheet>
  );
}
