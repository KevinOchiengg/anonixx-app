"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, COST } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { uploadFile } from "@/lib/upload";
import AppShell from "./AppShell";
import MediaPicker, { type MediaDraft } from "./compose/MediaPicker";
import VoiceRecorder, { type VoiceDraft } from "./compose/VoiceRecorder";
import PollEditor, { type PollDraft } from "./compose/PollEditor";
import LocationFields, { type LocationDraft } from "./compose/LocationFields";
import TagUser, { type Tagged } from "./compose/TagUser";

const INTENTS = [
  { id: "meet-me", label: "Meet Me", sub: "looking for something real", mood: "longing" },
  { id: "skeleton-in-the-closet", label: "Skeleton In The Closet", sub: "secrets don't stay buried", mood: "untold" },
  { id: "just-tonight", label: "Just Tonight", sub: "no strings attached affair", mood: "horny" },
] as const;
const FONTS = [
  { id: "classic", label: "Classic" },
  { id: "sultry-script", label: "Sultry" },
  { id: "bold-tease", label: "Bold" },
] as const;
const MODES = [["text", "Text"], ["media", "Photo / Video"], ["voice", "Voice"], ["poll", "Poll"]] as const;
type Mode = (typeof MODES)[number][0];
const fontStyle = (id: string): React.CSSProperties =>
  id === "classic" ? { fontFamily: "Georgia, serif", fontStyle: "italic" }
  : id === "sultry-script" ? { fontFamily: "'Brush Script MT', cursive" }
  : { fontWeight: 800 };
const MAX = 500;
const DRAFT_KEY = "anonixx.drops.draft.v1";
const VIBES = ["company", "friendship", "dating", "casual", "discreet", "adventure"];
const GENDERS = ["woman", "man", "other"];
const LOOKING = ["woman", "man", "anyone"];

function Inner() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [text, setText] = useState("");
  const [intent, setIntent] = useState<(typeof INTENTS)[number]["id"]>("skeleton-in-the-closet");
  const [mode, setMode] = useState<Mode>("text");
  const [media, setMedia] = useState<MediaDraft>(null);
  const [voice, setVoice] = useState<VoiceDraft>(null);
  const [poll, setPoll] = useState<PollDraft>({ question: "", options: ["", ""] });
  const [font, setFont] = useState<string>("bold-tease");
  const [loc, setLoc] = useState<LocationDraft>({ country: "", county: "", subCounty: "", estate: "" });
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
  const [tagged, setTagged] = useState<Tagged>(null);
  const [hint, setHint] = useState("");
  const [unsent, setUnsent] = useState(false);
  const draftReady = useRef(false);
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (d && typeof d === "object") {
        if (typeof d.text === "string") setText(d.text);
        if (typeof d.font === "string") setFont(d.font);
        if (typeof d.hint === "string") setHint(d.hint);
        if (INTENTS.some((i) => i.id === d.intent)) setIntent(d.intent);
        if (typeof d.text === "string" && d.text.trim()) { setUnsent(true); setKind("confession"); }
      }
    } catch { /* storage unavailable or corrupt draft */ }
    draftReady.current = true;
  }, []);

  useEffect(() => {
    if (!draftReady.current || done) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, intent, font, hint })); } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [text, intent, font, hint, done]);

  function discardDraft() {
    setText("");
    setHint("");
    setUnsent(false);
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }

  const mood = INTENTS.find((i) => i.id === intent)!.mood;
  const pollOpts = poll.options.map((o) => o.trim()).filter(Boolean);
  const confessionOk =
    mode === "poll" ? poll.question.trim().length > 0 && pollOpts.length >= 2
    : mode === "voice" ? !!voice
    : mode === "media" ? !!media || !!text.trim()
    : !!text.trim();
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
    } else if (!confessionOk) return;
    setBusy(true);
    setError("");
    try {
      let payload: Record<string, unknown> = {};
      if (kind === "confession") {
        if (mode === "media" && media) {
          const urls: string[] = [];
          for (const f of media.files) urls.push(await uploadFile(f, media.kind));
          payload = media.kind === "video" ? { media_type: "video", media_url: urls[0] }
            : urls.length > 1 ? { images: urls } : { media_type: "image", media_url: urls[0] };
        } else if (mode === "voice" && voice) {
          payload = {
            media_type: "voice",
            media_url: await uploadFile(voice.blob, "voice"),
            duration_seconds: voice.seconds,
            waveform_data: voice.waveform,
          };
        } else if (mode === "poll") {
          payload = { poll: { question: poll.question.trim(), options: pollOpts.slice(0, 4) } };
        }
      }
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
          confession: text.trim() || undefined,
          intent,
          mood_tag: mood,
          font_style: font,
          sensitivity: mature ? "mature" : "general",
          publisher_opt_in: true,
          ...(tagged ? { target_user_id: tagged.id } : {}),
          ...(tagged && hint.trim() ? { recognition_hint: hint.trim().toLowerCase() } : {}),
          ...(loc.country ? { location_country: loc.country } : {}),
          ...(loc.county.trim() ? { location_county: loc.county.trim() } : {}),
          ...(loc.subCounty.trim() ? { location_sub_county: loc.subCounty.trim() } : {}),
          ...(loc.estate.trim() ? { location_estate: loc.estate.trim() } : {}),
          ...payload,
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
      {unsent ? (
        <div className="unsent">
          <b>You almost sent this to them…</b>
          <span>Still here. Still waiting to be sent.</span>
          <div className="row">
            <button type="button" className="pill" onClick={() => setUnsent(false)}>Continue</button>
            <button type="button" className="pill ghost" onClick={discardDraft}>Discard</button>
          </div>
        </div>
      ) : null}
      <div className="cx-intents" role="radiogroup" aria-label="Confession type">
        {INTENTS.map((i) => (
          <button type="button" key={i.id} role="radio" aria-checked={intent === i.id} className={intent === i.id ? "on" : ""} onClick={() => setIntent(i.id)}>
            <strong>{i.label}</strong>
            <small>{i.sub}</small>
          </button>
        ))}
      </div>

      <div className="cx-tabs" role="tablist" aria-label="Format">
        {MODES.map(([id, label]) => (
          <button type="button" key={id} role="tab" aria-selected={mode === id} className={mode === id ? "on" : ""} onClick={() => setMode(id)}>{label}</button>
        ))}
      </div>

      {mode === "media" ? <MediaPicker value={media} onChange={setMedia} onError={setError} /> : null}
      {mode === "voice" ? <VoiceRecorder value={voice} onChange={setVoice} onError={setError} /> : null}
      {mode === "poll" ? <PollEditor value={poll} onChange={setPoll} /> : null}

      <label className="field">
        {mode === "text" ? "What can't you say out loud?" : "Add a caption (optional)"}
        <textarea
          rows={mode === "text" ? 7 : 3}
          maxLength={MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type it here. No name, no trace."
          style={fontStyle(font)}
        />
      </label>
      <div className="counter">{text.length}/{MAX}</div>

      <div className="cx-fonts" role="radiogroup" aria-label="Font style">
        {FONTS.map((f) => (
          <button type="button" key={f.id} role="radio" aria-checked={font === f.id} className={font === f.id ? "on" : ""} style={fontStyle(f.id)} onClick={() => setFont(f.id)}>{f.label}</button>
        ))}
      </div>

      <details className="cx-fold" open={!!tagged}>
        <summary>{tagged ? `Tagged: ${tagged.username ? "@" + tagged.username : tagged.anonymous_name}` : "Tag someone (optional)"}</summary>
        <div><TagUser value={tagged} onChange={setTagged} hint={hint} onHint={setHint} /></div>
      </details>

      <details className="cx-fold">
        <summary>Location (optional)</summary>
        <div><LocationFields value={loc} onChange={setLoc} /></div>
      </details>

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
