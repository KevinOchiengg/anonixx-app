"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, COST } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import AppShell from "./AppShell";

const MOODS = ["longing", "untold", "horny", "discreet"];
const MAX = 500;
const VIBES = ["company", "friendship", "dating", "casual", "discreet", "adventure"];
const GENDERS = ["woman", "man", "other"];
const LOOKING = ["woman", "man", "anyone"];

function Inner() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [text, setText] = useState("");
  const [mood, setMood] = useState("longing");
  const [mature, setMature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [kind, setKind] = useState<"hookup" | "confession" | null>(null);
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("woman");
  const [area, setArea] = useState("");
  const [lookingFor, setLookingFor] = useState("anyone");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [vibes, setVibes] = useState<string[]>([]);
  const [extra, setExtra] = useState("");
  const short = (user?.coin_balance ?? 0) < COST.post;

  const ageNum = parseInt(age, 10);
  const minNum = parseInt(ageMin, 10);
  const maxNum = parseInt(ageMax, 10);
  const hookupOk = ageNum >= 18 && ageNum <= 99 && area.trim().length > 0;

  function hookupText() {
    const range = minNum && maxNum ? ` aged ${minNum}–${maxNum}` : minNum ? ` aged ${minNum}+` : maxNum ? ` up to ${maxNum}` : "";
    const who = lookingFor === "anyone" ? "someone" : `a ${lookingFor}`;
    let t = `Hi, I'm ${ageNum} (${gender}), based in ${area.trim()}. Looking for ${who}${range}.`;
    if (vibes.length) t += ` Vibe: ${vibes.join(", ")}.`;
    if (extra.trim()) t += ` ${extra.trim()}`;
    return t;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (kind === "hookup") {
      if (ageNum < 18) { setError("You must be 18 or older to post a hookup confession."); return; }
      if (!hookupOk) { setError("Add your age and the area you are based in."); return; }
    } else if (!text.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api("/drops", {
        body: kind === "hookup" ? {
          kind: "hookup",
          confession: hookupText(),
          hookup: {
            age: ageNum,
            gender,
            area: area.trim(),
            looking_for: lookingFor,
            age_min: minNum || null,
            age_max: maxNum || null,
            vibes,
          },
          mood_tag: "longing",
          sensitivity: "mature",
          publisher_opt_in: true,
        } : {
          kind: "confession",
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

  if (!kind) {
    return (
      <div className="form pad kind-pick">
        <h2>What kind of confession?</h2>
        <button type="button" className="kind-card" onClick={() => setKind("hookup")}>
          <strong>Hookup confession</strong>
          <span>Say who you are and what you&apos;re after. People nearby can link up with you. 18+ only.</span>
        </button>
        <button type="button" className="kind-card" onClick={() => setKind("confession")}>
          <strong>Regular confession</strong>
          <span>Something you could never say out loud. Anyone can read it. No link-ups.</span>
        </button>
      </div>
    );
  }

  if (kind === "hookup") {
    const toggle = (v: string) => setVibes((c) => (c.includes(v) ? c.filter((x) => x !== v) : c.length < 4 ? [...c, v] : c));
    return (
      <form className="form pad" onSubmit={submit}>
        <button type="button" className="linkish" onClick={() => setKind(null)}>← Change type</button>
        <div className="hk-line">
          Hi, I&apos;m
          <input type="number" inputMode="numeric" min={18} max={99} value={age} onChange={(e) => setAge(e.target.value)} placeholder="age" aria-label="Age" />
          <select value={gender} onChange={(e) => setGender(e.target.value)} aria-label="Gender">
            {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          based in
          <input type="text" maxLength={60} value={area} onChange={(e) => setArea(e.target.value)} placeholder="area, e.g. Ruiru" aria-label="Area" />
        </div>
        <div className="hk-line">
          Looking for
          <select value={lookingFor} onChange={(e) => setLookingFor(e.target.value)} aria-label="Looking for">
            {LOOKING.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          aged
          <input type="number" inputMode="numeric" min={18} max={99} value={ageMin} onChange={(e) => setAgeMin(e.target.value)} placeholder="min" aria-label="Minimum age" />
          to
          <input type="number" inputMode="numeric" min={18} max={99} value={ageMax} onChange={(e) => setAgeMax(e.target.value)} placeholder="max" aria-label="Maximum age" />
        </div>
        <div className="chips" aria-label="Vibe">
          {VIBES.map((v) => (
            <button type="button" key={v} aria-pressed={vibes.includes(v)} className={vibes.includes(v) ? "on" : ""} onClick={() => toggle(v)}>
              {v}
            </button>
          ))}
        </div>
        <label className="field">
          Anything else? (optional)
          <textarea rows={3} maxLength={250} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Keep it discreet. No numbers, handles or links." />
        </label>
        {hookupOk ? <p className="hk-preview">{hookupText()}</p> : null}
        <p className="muted small">
          18+ only. Paid sex or escort offers aren&apos;t allowed and will be removed.
          Posting costs {COST.post} coins (free with a subscription). You have {user?.coin_balance ?? 0}.
        </p>
        {error ? <div className="err">{error}</div> : null}
        <div className="row">
          {short ? <Link href="/coins" className="pill ghost">Get coins</Link> : null}
          <button className="btn" disabled={busy || !hookupOk}>{busy ? "Posting…" : "Drop it"}</button>
        </div>
      </form>
    );
  }

  return (
    <form className="form pad" onSubmit={submit}>
      <button type="button" className="linkish" onClick={() => setKind(null)}>← Change type</button>
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
