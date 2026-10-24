"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, COST } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { uploadFile } from "@/lib/upload";
import AppShell from "./AppShell";
import MediaPicker, { type MediaDraft } from "./compose/MediaPicker";
import { isMeaningful } from "@/lib/videoEdit";
import { queueStreamDrop } from "@/lib/streamVideo";
import { useBgUpload, type BgUpload } from "@/lib/bgUpload";
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
const GENDERS: [string, string][] = [["woman", "Woman"], ["man", "Man"], ["other", "Other"]];
const LOOKING: [string, string][] = [["woman", "Women"], ["man", "Men"], ["anyone", "Anyone"]];

function Inner() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("text");
  const [media, setMedia] = useState<MediaDraft>(null);
  // a picked video uploads in the background (lib/bgUpload.ts): show it, and stop it if we leave
  const upState = useBgUpload(media?.kind === "video" ? media.upload ?? null : null);
  const uploadRef = useRef<BgUpload | null | undefined>(null);
  uploadRef.current = media?.upload;
  useEffect(() => () => uploadRef.current?.cancel(), []);
  const [voice, setVoice] = useState<VoiceDraft>(null);
  const [poll, setPoll] = useState<PollDraft>({ question: "", options: ["", ""] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"" | "live" | "processing">("");
  const [kind, setKind] = useState<"hookup" | "confession" | null>(null);
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
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
  useEffect(() => {
    if (user?.is_admin) router.replace("/admin/post");
  }, [user?.is_admin, router]);
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
  const ageErr = age && (ageNum < 18 || ageNum > 99)
    ? (ageNum < 18 ? "You have to be 18 or older to post here." : "Enter a real age.") : "";
  const rangeErr = (ageMin && minNum < 18) || (ageMax && maxNum < 18)
    ? "Everyone here is 18+, so start at 18."
    : minNum && maxNum && minNum > maxNum ? "Min is higher than max." : "";
  // What still stands between the draft and the Drop button, in plain words.
  const missing = [
    !age ? "your age" : ageErr ? "an age between 18 and 99" : "",
    !area.trim() ? "where you are" : "",
    rangeErr ? "a valid age range" : "",
  ].filter(Boolean);
  const hookupOk = missing.length === 0;

  function hookupText(draft = false) {
    const range = minNum && maxNum ? ` aged ${minNum}–${maxNum}` : minNum ? ` aged ${minNum}+` : maxNum ? ` up to ${maxNum}` : "";
    const who = lookingFor === "anyone" ? "someone" : `a ${lookingFor}`;
    const shownAge = age ? ageNum : draft ? "__" : "";
    const shownArea = area.trim() || (draft ? "__" : "");
    let t = `Hi, I'm ${shownAge}${gender ? ` (${gender})` : ""}, based in ${shownArea}. Looking for ${who}${range}.`;
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
      let streamUid = "";
      if (kind === "confession") {
        if (mode === "media" && media?.kind === "video" && media.upload) {
          // Uploading since it was picked (lib/bgUpload.ts); this just waits for it to finish.
          const uploaded = await media.upload.wait();
          const overlays = media.edit?.overlays.filter((o) => o.text.trim()) ?? [];
          if ("streamUid" in uploaded) {
            // Stream: the backend cuts the window out, watermarks it and posts it when ready.
            streamUid = uploaded.streamUid;
            payload = { media_type: "video", ...(media.edit && overlays.length ? { video_edit: { ...media.edit, overlays } } : {}) };
          } else {
            const edit = isMeaningful(media.edit, media.duration ?? 0) ? { ...media.edit, overlays } : null;
            payload = { media_type: "video", media_url: uploaded.url, ...(edit ? { video_edit: edit } : {}) };
          }
        } else if (mode === "media" && media) {
          const urls: string[] = [];
          for (const f of media.files) urls.push(await uploadFile(f, media.kind));
          const edit = media.kind === "video" && isMeaningful(media.edit, media.duration ?? 0)
            ? { ...media.edit, overlays: media.edit.overlays.filter((o) => o.text.trim()) } : null;
          payload = media.kind === "video" ? { media_type: "video", media_url: urls[0], ...(edit ? { video_edit: edit } : {}) }
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
      const body = kind === "hookup" ? {
          kind: "hookup",
          confession: hookupText(),
          hookup: {
            age: ageNum,
            ...(gender ? { gender } : {}),
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
        };
      if (streamUid && media) await queueStreamDrop(body, streamUid, media.edit ?? null, null);
      else await api("/drops", { body });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      refresh();
      setDone(streamUid ? "processing" : "live");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="empty">
        <h2>{done === "processing" ? "Almost out there." : "It's live."}</h2>
        <p>{done === "processing" ? "Your video is being polished up. It lands in the feed in a minute or two, and nobody will know it's you." : "Your confession is out there. Nobody knows it's you."}</p>
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
          <span className="kind-ico" aria-hidden>🔥</span>
          <span className="kind-body">
            <strong>Hookup</strong>
            <span>Say who you are and who you want. If someone wants you back, they ask to link up.</span>
            <span className="kind-tags"><em>18+</em><em>{COST.post} coins</em><em>Link up on</em></span>
          </span>
        </button>
        <button type="button" className="kind-card" onClick={() => setKind("confession")}>
          <span className="kind-ico" aria-hidden>🪶</span>
          <span className="kind-body">
            <strong>Confession</strong>
            <span>The thing you can&apos;t say out loud. Read, felt, never traced back to you.</span>
            <span className="kind-tags"><em>Free</em><em>Text, photo, video or voice</em></span>
          </span>
        </button>
      </div>
    );
  }

  if (kind === "hookup") {
    const toggle = (v: string) => setVibes((c) => (c.includes(v) ? c.filter((x) => x !== v) : c.length < 4 ? [...c, v] : c));
    const digits = (v: string) => v.replace(/\D/g, "").slice(0, 2);
    return (
      <form className="form pad hk" onSubmit={submit}>
        <button type="button" className="linkish" onClick={() => setKind(null)}>← Hookup · change</button>

        <section className="hk-step">
          <h3><b>1</b>You</h3>
          <p className="hk-hint">Only what you choose to share.</p>
          <div className="hk-you">
            <input className={`hk-field hk-age${ageErr ? " bad" : ""}`} inputMode="numeric" value={age} onChange={(e) => setAge(digits(e.target.value))} placeholder="Age" aria-label="Your age" />
            <div className="chips" role="group" aria-label="I am">
              {GENDERS.map(([k, l]) => (
                <button type="button" key={k} aria-pressed={gender === k} className={gender === k ? "on" : ""} onClick={() => setGender(gender === k ? "" : k)}>{l}</button>
              ))}
            </div>
          </div>
          {ageErr ? <p className="hk-err">{ageErr}</p> : null}
        </section>

        <section className="hk-step">
          <h3><b>2</b>Where you are</h3>
          <p className="hk-hint">A neighborhood or city. Never your exact address.</p>
          <input className="hk-field" type="text" maxLength={60} value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Downtown" aria-label="Where you are" />
        </section>

        <section className="hk-step">
          <h3><b>3</b>Who you want</h3>
          <div className="chips" role="group" aria-label="Looking for">
            {LOOKING.map(([k, l]) => (
              <button type="button" key={k} aria-pressed={lookingFor === k} className={lookingFor === k ? "on" : ""} onClick={() => setLookingFor(k)}>{l}</button>
            ))}
          </div>
          <div className="hk-range">
            Aged
            <input className={`hk-field${rangeErr ? " bad" : ""}`} inputMode="numeric" value={ageMin} onChange={(e) => setAgeMin(digits(e.target.value))} placeholder="18" aria-label="Youngest age" />
            to
            <input className={`hk-field${rangeErr ? " bad" : ""}`} inputMode="numeric" value={ageMax} onChange={(e) => setAgeMax(digits(e.target.value))} placeholder="99" aria-label="Oldest age" />
            <span className="hk-opt">optional</span>
          </div>
          {rangeErr ? <p className="hk-err">{rangeErr}</p> : null}
        </section>

        <section className="hk-step">
          <h3><b>4</b>The vibe <span className="hk-count">{vibes.length}/4</span></h3>
          <div className="chips" role="group" aria-label="Vibe">
            {VIBES.map((v) => (
              <button type="button" key={v} aria-pressed={vibes.includes(v)} className={vibes.includes(v) ? "on" : ""} onClick={() => toggle(v)}>
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </section>

        <section className="hk-step">
          <h3>Anything else? <span className="hk-opt">optional</span></h3>
          <textarea className="hk-field" rows={3} maxLength={250} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Keep it discreet. No numbers, handles or links." />
        </section>

        <div className="hk-preview">
          <span>How it reads</span>
          <p>{hookupText(true)}</p>
        </div>

        {error ? <div className="err">{error}</div> : null}
        <div className="hk-foot">
          <button className="btn" disabled={busy || !hookupOk}>{busy ? "Posting…" : `Drop it · ${COST.post} coins`}</button>
          {!hookupOk ? <p className="hk-missing">Add {missing.join(", ")} to drop it.</p> : null}
          <p className="muted small">
            18+ only. Free with a subscription. You have {user?.coin_balance ?? 0} coins.
            {short ? <> <Link href="/coins">Get coins</Link></> : null}
          </p>
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
      act: () => { if (hasMedia) { media?.upload?.cancel(); setMedia(null); setMode("text"); } else pickMode("media"); } },
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

      <button className="cx-drop" disabled={busy || !confessionOk}>{busy ? (upState?.status === "uploading" ? `Finishing upload… ${upState.pct}%` : "Posting…") : "Drop it  ↗"}</button>
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
