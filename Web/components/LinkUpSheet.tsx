"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, COST, type Post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { uploadFile } from "@/lib/upload";
import { INTENTS, MAX_INTENTS, MAX_PITCH } from "@/lib/linkup";
import AgeGate from "./AgeGate";
import Sheet from "./Sheet";

const MAX_CLUE_VIDEO_SECONDS = 30;

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
  post, onClose, onDone,
}: {
  post: Pick<Post, "id" | "anonymous_name" | "avatar_url" | "content">;
  onClose: () => void;
  /** When set (the Room), a sent link up closes the sheet and hands back instead of showing the sent screen. */
  onDone?: () => void;
}) {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [clue, setClue] = useState<Clue | null>(null);
  const [pitch, setPitch] = useState("");
  const [intents, setIntents] = useState<string[]>([]);
  const [ageGate, setAgeGate] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const balance = user?.coin_balance ?? 0;
  const canAfford = balance >= COST.linkUp || !!user?.is_premium;
  const name = post.anonymous_name || "Anonymous";

  useEffect(() => { refresh(); }, [refresh]);
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
      if (pitch.trim()) body.pitch = pitch.trim();
      if (intents.length) body.intents = intents;
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
      if ((r.already_unlocked || r.mutual) && r.connection_id) {
        router.push(`/chat/${r.connection_id}`);
        return;
      }
      refresh();
      if (onDone) { onDone(); onClose(); return; }
      setSent(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === "age_verification_required") { setAgeGate(true); return; }
      setError(e instanceof ApiError && e.status === 402 ? "Not enough coins. Top up your wallet first." : (e as Error).message);
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
          <h3>Link up sent.</h3>
          <p className="u-copy">
            {post.anonymous_name || "They"} sees your line first. Nothing&apos;s charged yet, you only pay if they say yes.
          </p>
          <button className="u-cta" onClick={finish}>See my link ups</button>
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
        <h3 className="u-name">{name}</h3>
        {post.content ? <p className="u-quote">&ldquo;{post.content}&rdquo;</p> : null}
        {ageGate ? <AgeGate compact onDone={() => setAgeGate(false)} /> : null}
        <div className="lu-pitch">
          <label htmlFor="lu-pitch">Your opening line</label>
          <textarea
            id="lu-pitch"
            value={pitch}
            onChange={(e) => setPitch(e.target.value.slice(0, MAX_PITCH))}
            placeholder="Make them want to say yes…"
            rows={2}
          />
          <small>{pitch.length}/{MAX_PITCH} · no numbers or handles, that comes after they accept</small>
          <div className="lu-chips">
            {INTENTS.map((i) => (
              <button type="button" key={i.id} className={intents.includes(i.id) ? "on" : ""} onClick={() => toggleIntent(i.id)}>
                {i.label}
              </button>
            ))}
          </div>
        </div>

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
              Add a photo or short clip (optional)
            </button>
          )}
          <p className="u-hint">A clue of who&apos;s asking. Keep it decent, reported clues get accounts restricted.</p>
        </div>

        <div className="u-price">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 1-3s1 2 2 2c0-3 2-5 2-8z" /></svg>
          {COST.linkUp} coins
        </div>
        <div className="u-bal">Your balance: {balance} coin{balance === 1 ? "" : "s"}</div>

        {error ? <div className="err">{error}</div> : null}

        {canAfford ? (
          <>
            <button className="u-cta" onClick={go} disabled={busy}>{busy ? "Sending…" : "Link up"}</button>
            <p className="u-note">{COST.linkUp} coins, only if they say yes. Free if they already linked up with you.</p>
          </>
        ) : (
          <Link href="/coins" className="u-cta alt">Top up your coins</Link>
        )}
        <button className="u-link-btn" onClick={onClose}>Not now</button>
      </div>
    </Sheet>
  );
}
