"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, COST } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import AppShell from "./AppShell";
import GuidedConfession, { GUIDED_SAVE_KEY } from "./compose/GuidedConfession";
import { Flame, MessageSquareLock } from "lucide-react";

const MAX = 1800;
const DRAFT_KEY = "anonixx.drops.draft.v1";

function Inner() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [kind, setKind] = useState<"hookup" | "confession" | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const draftReady = useRef(false);

  useEffect(() => {
    if (user?.is_admin) router.replace("/admin/post");
  }, [user?.is_admin, router]);

  // Bring back an unsent confession, or a half-done hookup.
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (typeof d?.text === "string" && d.text.trim()) { setText(d.text.slice(0, MAX)); setKind("confession"); }
      else if (JSON.parse(localStorage.getItem(GUIDED_SAVE_KEY) || "null")?.started) setKind("hookup");
    } catch { /* storage unavailable or corrupt draft */ }
    draftReady.current = true;
  }, []);

  useEffect(() => {
    if (!draftReady.current || done) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ text })); } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [text, done]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text, kind]);

  const body = text.trim();
  const left = MAX - text.length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/drops", {
        body: {
          kind: "confession", confession: body, intent: "skeleton-in-the-closet", mood_tag: "untold",
          sensitivity: "general", publisher_opt_in: false,
        },
      });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      refresh();
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="empty">
        <h2>It&apos;s live.</h2>
        <p>Your confession is out there. Nobody knows it&apos;s you.</p>
        <div className="row">
          <button className="pill" onClick={() => router.push("/")}>Back to the feed</button>
        </div>
      </div>
    );
  }

  if (!kind) {
    return (
      <div className="form pad kind-pick">
        <h2>What are you dropping tonight?</h2>
        <p className="muted small">Either way, nobody sees who you are.</p>
        <button type="button" className="kind-card" onClick={() => setKind("hookup")}>
          <span className="kind-ico" aria-hidden><Flame strokeWidth={2} /></span>
          <span className="kind-body">
            <strong>Hookup confession</strong>
            <span>Who you are, who you want, when. The right one knocks.</span>
            <span className="kind-tags"><em>18+</em><em>{COST.post} coins</em><em>Link up on</em></span>
          </span>
        </button>
        <button type="button" className="kind-card" onClick={() => setKind("confession")}>
          <span className="kind-ico" aria-hidden><MessageSquareLock strokeWidth={2} /></span>
          <span className="kind-body">
            <strong>General Confession</strong>
            <span>The thing you can&apos;t say out loud. Never traced back to you.</span>
            <span className="kind-tags"><em>Free</em><em>Text</em></span>
          </span>
        </button>
      </div>
    );
  }

  if (kind === "hookup") return <GuidedConfession onBack={() => setKind(null)} />;

  return (
    <form className="cx-form" onSubmit={submit}>
      <div className="cx-top">
        <button type="button" className="cx-switch" onClick={() => setKind(null)}>General Confession · change</button>
      </div>

      {/* Same surface as the hookup composer's box and live preview. */}
      <div className="gc-card">
        <div className="cx-write">
          <textarea
            ref={area}
            rows={5}
            maxLength={MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Say what you can't say out loud."
            aria-label="Your confession"
            autoFocus
          />
        </div>
      </div>

      <div className={`cx-count${left <= 20 ? (left <= 0 ? " bad" : " warn") : ""}`}>{left}</div>
      {error ? <div className="err">{error}</div> : null}

      <button className="cx-drop" disabled={busy || !body}>{busy ? "Posting…" : "Drop it  ↗"}</button>
      <p className="cx-foot">Stay hidden. No numbers, handles or links.</p>
    </form>
  );
}

export default function ComposeForm() {
  return (
    <AppShell title="New confession" back="/">
      <Inner />
    </AppShell>
  );
}
