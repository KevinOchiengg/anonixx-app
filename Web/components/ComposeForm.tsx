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
import TagUser, { type Tagged } from "./compose/TagUser";
import LocationFields, { type LocationDraft } from "./compose/LocationFields";
import Sheet from "./Sheet";
import {
  IconImages, IconSparkles, IconUserPlus, IconPin, IconMic, IconPoll, IconShare, IconShuffle, IconX, IconWarn,
} from "./compose/toolicons";

const MODES = [["text", "Text"], ["media", "Photo / Video"], ["voice", "Voice"], ["poll", "Poll"]] as const;
type Mode = (typeof MODES)[number][0];
const MAX = 500;
const DRAFT_KEY = "anonixx.drops.draft.v1";
const INTENTS = {
  "meet-me": { label: "Meet Me", sub: "looking for something real", mood: "longing", from: "#12070c", to: "#2a121b", accent: "#FF6B8A", text: "#FBE8ED", hint: "#C98A9B" },
  "skeleton-in-the-closet": { label: "Skeleton In The Closet", sub: "secrets don't stay buried", mood: "untold", from: "#14060a", to: "#2a0f18", accent: "#FF3B7A", text: "#F6E6EC", hint: "#C48A98" },
  "just-tonight": { label: "Just Tonight", sub: "no strings attached affair", mood: "horny", from: "#0a0000", to: "#2b0505", accent: "#FF1744", text: "#FFE4E4", hint: "#C97A7A" },
} as const;
type IntentId = keyof typeof INTENTS;
const PROMPTS: Record<IntentId, string[]> = {
  "meet-me": ["I keep hoping the right person reads this—", "If you're out there and tired of games too—", "I want someone who actually stays. Here's why—", "Nobody's asked what I really want in a long time—"],
  "skeleton-in-the-closet": ["I've never told anyone this—", "Something I've been carrying alone—", "If you knew this about me—", "The thing I think about at 3am—"],
  "just-tonight": ["Tonight I don't want to think, I just want—", "No names, no promises, just—", "I'm free tonight and I want—", "Something impulsive I can't stop thinking about—"],
};
const EDGE = [/\bkill\b/i, /\bsuicide\b/i, /\bend it\b/i, /\bhate (myself|him|her|them)\b/i, /\bcheat(?:ed|ing)?\b/i, /\baffair\b/i, /\bleave (him|her|them)\b/i];
function detectEdge(t: string): "raw" | "long" | null {
  if (t.length < 20) return null;
  if (EDGE.some((re) => re.test(t))) return "raw";
  return t.length > 200 ? "long" : null;
}
const VIBES = ["company", "friendship", "dating", "casual", "discreet", "adventure"];
const GENDERS = ["woman", "man", "other"];
const LOOKING = ["woman", "man", "anyone"];

function Inner() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("text");
  const [media, setMedia] = useState<MediaDraft>(null);
  const [voice, setVoice] = useState<VoiceDraft>(null);
  const [poll, setPoll] = useState<PollDraft>({ question: "", options: ["", ""] });
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
  const [intent, setIntent] = useState<IntentId>("skeleton-in-the-closet");
  const [sheet, setSheet] = useState<"mood" | "tag" | "place" | "share" | null>(null);
  const [place, setPlace] = useState<LocationDraft>({ country: "", county: "", subCounty: "", estate: "" });
  const [shareOut, setShareOut] = useState(true);
  const [promptIx, setPromptIx] = useState(0);
  const area_ = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setPromptIx(Math.floor(Math.random() * 4)); }, [intent]);
  useEffect(() => {
    const el = area_.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text, mode, kind]);
  const draftReady = useRef(false);
  const adminSkipped = useRef(false);
  useEffect(() => {
    if (!user?.is_admin || adminSkipped.current) return;
    adminSkipped.current = true;
    setKind((k) => k ?? "confession");
  }, [user?.is_admin]);
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (d && typeof d === "object") {
        if (typeof d.text === "string") setText(d.text);
        if (typeof d.hint === "string") setHint(d.hint);
        if (typeof d.text === "string" && d.text.trim()) { setUnsent(true); setKind("confession"); }
      }
    } catch { /* storage unavailable or corrupt draft */ }
    draftReady.current = true;
  }, []);

  useEffect(() => {
    if (!draftReady.current || done) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, hint })); } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [text, hint, done]);

  function discardDraft() {
    setText("");
    setHint("");
    setUnsent(false);
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }

  const pollOpts = poll.options.map((o) => o.trim()).filter(Boolean);
  const confessionOk =
    mode === "poll" ? poll.question.trim().length > 0 && pollOpts.length >= 2
    : mode === "voice" ? !!voice
    : mode === "media" ? !!media
    : !!text.trim();
  const theme = INTENTS[intent];
  const edge = detectEdge(text);
  const placed = [place.estate, place.subCounty, place.county, place.country].some((v) => v.trim());
  function pickMode(m: Mode) {
    setMode(mode === m ? "text" : m);
  }
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
          mood_tag: theme.mood,
          font_style: "bold-tease",
          sensitivity: "general",
          publisher_opt_in: shareOut,
          ...(place.country.trim() ? { location_country: place.country.trim() } : {}),
          ...(place.county.trim() ? { location_county: place.county.trim() } : {}),
          ...(place.subCounty.trim() ? { location_sub_county: place.subCounty.trim() } : {}),
          ...(place.estate.trim() ? { location_estate: place.estate.trim() } : {}),
          ...(tagged ? { target_user_id: tagged.id } : {}),
          ...(tagged && hint.trim() ? { recognition_hint: hint.trim().toLowerCase() } : {}),
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
          18+ only.
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

  const admin = Boolean(user?.is_admin);
  const prompts = PROMPTS[intent];
  const left = MAX - text.length;
  const cardVars = {
    "--cx-from": theme.from, "--cx-to": theme.to, "--cx-accent": theme.accent, "--cx-text": theme.text, "--cx-hint": theme.hint,
  } as React.CSSProperties;
  const hasMedia = mode === "media" && !!media;
  const tools: { key: string; label: string; icon: React.ReactNode; on: boolean; show: boolean; act: () => void }[] = [
    { key: "photo", label: hasMedia ? "Remove" : "Photo", icon: hasMedia ? <IconX /> : <IconImages />, on: mode === "media", show: admin,
      act: () => { if (hasMedia) { setMedia(null); setMode("text"); } else pickMode("media"); } },
    { key: "mood", label: "Mood", icon: <IconSparkles />, on: false, show: true, act: () => setSheet("mood") },
    { key: "tag", label: "Tag", icon: <IconUserPlus />, on: !!tagged, show: true, act: () => setSheet("tag") },
    { key: "place", label: "Place", icon: <IconPin />, on: placed, show: true, act: () => setSheet("place") },
    { key: "voice", label: "Voice", icon: <IconMic />, on: mode === "voice", show: admin, act: () => pickMode("voice") },
    { key: "poll", label: "Poll", icon: <IconPoll />, on: mode === "poll", show: admin, act: () => pickMode("poll") },
    { key: "share", label: "Share", icon: <IconShare />, on: !shareOut, show: true, act: () => setSheet("share") },
  ];

  return (
    <form className="cx-form" onSubmit={submit}>
      <div className="cx-top">
        <button type="button" className="cx-switch" onClick={() => setKind(null)}>Confession · change</button>
      </div>
      <div className="cx-cost">
        <span>{COST.post} coins to send</span>
        <span className={short ? "low" : ""}>
          Balance: {user?.coin_balance ?? 0}
          {short ? <Link href="/coins"> Top up</Link> : null}
        </span>
      </div>

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

      {!text ? <p className="cx-guide">Say what you can&apos;t say out loud. Nobody will know it&apos;s you.</p> : null}

      <div className="cx-live" style={cardVars}>
        {mode === "media" ? <div className="cx-zone"><MediaPicker value={media} onChange={setMedia} onError={setError} /></div> : null}
        {mode === "voice" ? <div className="cx-zone"><VoiceRecorder value={voice} onChange={setVoice} onError={setError} /></div> : null}
        {mode === "poll" ? <div className="cx-zone"><PollEditor value={poll} onChange={setPoll} /></div> : null}
        <div className="cx-write">
          <textarea
            ref={area_}
            rows={mode === "text" ? 4 : 2}
            maxLength={MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={mode === "text" ? prompts[promptIx % prompts.length] : "Add a caption (optional)"}
            aria-label="Your confession"
          />
          {!text && mode === "text" ? (
            <button type="button" className="cx-shuffle" aria-label="Try another opening line" onClick={() => setPromptIx((i) => i + 1)}><IconShuffle /></button>
          ) : null}
        </div>
        <div className="cx-toolbar" role="toolbar" aria-label="Add to your drop">
          {tools.filter((t) => t.show).map((t) => (
            <button type="button" key={t.key} className={t.on ? "on" : ""} onClick={t.act} aria-label={t.label}>
              <span className="g">{t.icon}{t.on ? <i /> : null}</span>
              <span className="l">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={`cx-count${left <= 20 ? (left <= 0 ? " bad" : " warn") : ""}`}>{left}</div>

      {edge ? (
        <div className="cx-edge">
          <IconWarn />
          <div>
            {edge === "long" ? <p>That&apos;s a lot to send at once. Shorter confessions hit harder.</p> : (
              <>
                <b>This could change everything between you two.</b>
                <p>No taking it back once it&apos;s sent.</p>
              </>
            )}
          </div>
        </div>
      ) : null}
      {error ? <div className="err">{error}</div> : null}

      <button className="cx-drop" disabled={busy || !confessionOk}>{busy ? "Posting…" : `Drop it — ${COST.post} coins  ↗`}</button>
      <p className="cx-foot">Your identity stays hidden. Always. Don&apos;t share phone numbers, handles or links.</p>

      {sheet === "mood" ? (
        <Sheet title="Confession type" onClose={() => setSheet(null)}>
          <p className="cx-sub">You want it. They want it. Drop it, get found.</p>
          <div className="cx-moods">
            {(Object.keys(INTENTS) as IntentId[]).map((id) => (
              <button type="button" key={id} className={intent === id ? "on" : ""} onClick={() => { setIntent(id); setSheet(null); }}
                style={{ "--cx-from": INTENTS[id].from, "--cx-to": INTENTS[id].to, "--cx-accent": INTENTS[id].accent } as React.CSSProperties}>
                <span className="tile" />
                <b>{INTENTS[id].label}</b>
                <small>{INTENTS[id].sub}</small>
              </button>
            ))}
          </div>
        </Sheet>
      ) : null}
      {sheet === "tag" ? (
        <Sheet title="Tag someone" onClose={() => setSheet(null)} tall>
          <TagUser value={tagged} onChange={setTagged} hint={hint} onHint={setHint} />
          <button type="button" className="cx-done" onClick={() => setSheet(null)}>Done</button>
        </Sheet>
      ) : null}
      {sheet === "place" ? (
        <Sheet title="Location" onClose={() => setSheet(null)} tall>
          <p className="cx-sub">Nearby people find your drop faster. Totally optional.</p>
          <LocationFields value={place} onChange={setPlace} />
          <button type="button" className="cx-done" onClick={() => setSheet(null)}>Done</button>
        </Sheet>
      ) : null}
      {sheet === "share" ? (
        <Sheet title="Share to socials" onClose={() => setSheet(null)}>
          <label className="cx-toggle">
            <span><b>Share to Anonixx socials</b><small>Anonymous. Your identity never leaves Anonixx.</small></span>
            <input type="checkbox" checked={shareOut} onChange={(e) => setShareOut(e.target.checked)} />
          </label>
          <button type="button" className="cx-done" onClick={() => setSheet(null)}>Done</button>
        </Sheet>
      ) : null}
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
