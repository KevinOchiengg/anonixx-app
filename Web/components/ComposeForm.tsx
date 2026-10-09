"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, COST } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import AppShell from "./AppShell";

const MOODS = ["longing", "untold", "horny", "discreet"];
const MAX = 500;

function Inner() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [text, setText] = useState("");
  const [mood, setMood] = useState("longing");
  const [mature, setMature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const short = (user?.coin_balance ?? 0) < COST.post;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api("/drops", {
        body: {
          confession: text.trim(),
          mood_tag: mood,
          sensitivity: mature ? "mature" : "general",
          publisher_opt_in: true,
        },
      });
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

  return (
    <form className="form pad" onSubmit={submit}>
      <label className="field">
        What can&apos;t you say out loud?
        <textarea
          rows={7}
          maxLength={MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type it here. No name, no trace."
          autoFocus
        />
      </label>
      <div className="counter">{text.length}/{MAX}</div>

      <div className="chips" role="radiogroup" aria-label="Mood">
        {MOODS.map((m) => (
          <button type="button" key={m} role="radio" aria-checked={mood === m} className={mood === m ? "on" : ""} onClick={() => setMood(m)}>
            {m}
          </button>
        ))}
      </div>

      <label className="check">
        <input type="checkbox" checked={mature} onChange={(e) => setMature(e.target.checked)} />
        <span>Mark as mature. Only age-verified members see it, and it won&apos;t show on Google.</span>
      </label>

      <p className="muted small">
        Posting costs {COST.post} coins (free with a subscription). You have {user?.coin_balance ?? 0}.
        {" "}Don&apos;t share phone numbers, handles or links.
      </p>
      {error ? <div className="err">{error}</div> : null}
      <div className="row">
        {short ? <Link href="/coins" className="pill ghost">Get coins</Link> : null}
        <button className="btn" disabled={busy || !text.trim()}>{busy ? "Posting…" : "Drop it"}</button>
      </div>
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
