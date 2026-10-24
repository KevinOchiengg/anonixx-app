"use client";
/**
 * The hookup half of /compose: five short questions asked one at a time, then a
 * reveal where the AI writer (POST /guided/generate) turns the answers into a
 * confession the poster can re-tone, regenerate, edit and drop.
 *
 * Answers are kept in localStorage as they change, so going back a step, or
 * leaving and coming back, never loses them. If the writer is off or fails the
 * poster is told and writes it themselves; nothing is filled in from a template.
 * Posting goes through POST /drops (kind="hookup") with every usual check.
 * Mirrors Frontend/src/components/drops/GuidedConfession.jsx.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, COST } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import AgeGate from "../AgeGate";

const SAVE_KEY = "anonixx.drops.guided.v1";
const MAX = 500;

// Ids must match HOOKUP_* in Backend/app/api/v1/drops.py.
const CRAVINGS: [string, string][] = [["warmth", "Warmth"], ["attention", "Attention"], ["intimacy", "Intimacy"], ["chemistry", "Chemistry"], ["companionship", "Companionship"]];
const LOOKING: [string, string][] = [["woman", "Women"], ["man", "Men"], ["anyone", "Anyone"]];
const CONNECTION: [string, string][] = [["casual", "Casual"], ["dating", "Dating"], ["company", "Company"], ["discreet", "Discreet"], ["adventure", "Adventure"], ["friendship", "Friendship"]];
const GENDERS: [string, string][] = [["woman", "Woman"], ["man", "Man"], ["other", "Other"]];
const TRAITS: [string, string][] = [["sweet", "Sweet"], ["playful", "Playful"], ["shy", "Shy"], ["adventurous", "Adventurous"], ["affectionate", "Affectionate"], ["bold", "Bold"], ["curious", "Curious"], ["calm", "Calm"]];
const HOSTING: [string, string][] = [["can_host", "I can host"], ["can_travel", "I'll come to you"], ["either", "Either works"], ["decide", "Let's decide together"]];
const TONES: [string, string][] = [["vulnerable", "Vulnerable"], ["playful", "Playful"], ["mysterious", "Mysterious"], ["direct", "Direct"]];
const HOSTING_TAG: Record<string, string> = { can_host: "can host", can_travel: "can travel", either: "host or travel" };

const STEPS = [
  { q: "What have you been craving lately?", sub: "No one sees this part. Just be honest." },
  { q: "Who would you love to find?", sub: "Who, and where they can find you." },
  { q: "What makes you, you?", sub: "Pick up to three. Only what feels true." },
  { q: "Tell us something they wouldn't know about you.", sub: "A small, real thing. It's what makes yours different from everyone else's." },
  { q: "If the chemistry feels right, what's possible?", sub: "Only what you're comfortable with. You can change your mind later." },
];
const WAITING = ["listening to what you said…", "finding your words…", "keeping it yours…"];

type Answers = {
  craving: string | null; cravingCustom: string;
  lookingFor: string; ageMin: string; ageMax: string; area: string; connection: string[];
  age: string; gender: string | null; traits: string[];
  secret: string;
  hosting: string | null; publicFirst: boolean;
};
const EMPTY: Answers = {
  craving: null, cravingCustom: "",
  lookingFor: "anyone", ageMin: "", ageMax: "", area: "", connection: [],
  age: "", gender: null, traits: [],
  secret: "",
  hosting: null, publicFirst: false,
};

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 2);
const toggleIn = (list: string[], v: string, max: number) => (list.includes(v) ? list.filter((x) => x !== v) : list.length < max ? [...list, v] : list);

function stepProblem(i: number, a: Answers): string {
  if (i === 0) return !a.craving || (a.craving === "custom" && !a.cravingCustom.trim()) ? "Pick one, or say it in your own words." : "";
  if (i === 1) {
    if (!a.area.trim()) return "Add where you are.";
    const lo = Number(a.ageMin), hi = Number(a.ageMax);
    if ((a.ageMin && lo < 18) || (a.ageMax && hi < 18)) return "Everyone here is 18+, so start at 18.";
    if (a.ageMin && a.ageMax && lo > hi) return "The youngest age is higher than the oldest.";
    return "";
  }
  if (i === 2) {
    const age = Number(a.age);
    if (!a.age) return "Add your age.";
    if (age < 18) return "You have to be 18 or older to post here.";
    if (age > 99) return "Enter a real age.";
  }
  return "";
}

function Chips({ options, isOn, onPick, label }: { options: [string, string][]; isOn: (k: string) => boolean; onPick: (k: string) => void; label: string }) {
  return (
    <div className="chips gc-chips" role="group" aria-label={label}>
      {options.map(([k, l]) => (
        <button type="button" key={k} aria-pressed={isOn(k)} className={isOn(k) ? "on" : ""} onClick={() => onPick(k)}>{l}</button>
      ))}
    </div>
  );
}

export default function GuidedConfession({ onBack }: { onBack: () => void }) {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [a, setA] = useState<Answers>(EMPTY);
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const set = (patch: Partial<Answers>) => setA((cur) => ({ ...cur, ...patch }));

  const [writer, setWriter] = useState<{ enabled: boolean | null; remaining: number | null }>({ enabled: null, remaining: null });
  const [text, setText] = useState("");
  const [tone, setTone] = useState("vulnerable");
  const [drafts, setDrafts] = useState<string[]>([]);
  const [aiText, setAiText] = useState("");
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [ageGate, setAgeGate] = useState(false);
  const [waitIx, setWaitIx] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (saved?.a) setA({ ...EMPTY, ...saved.a });
      if (typeof saved?.step === "number") setStep(Math.min(saved.step, 4));
    } catch { /* storage unavailable or corrupt */ }
    setReady(true);
    api<{ enabled: boolean; remaining: number }>("/guided/status")
      .then((r) => setWriter({ enabled: r.enabled, remaining: r.remaining }))
      .catch(() => setWriter({ enabled: false, remaining: null }));
  }, []);

  useEffect(() => {
    if (!ready || done) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify({ a, step: Math.min(step, 4) })); } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [a, step, ready, done]);

  useEffect(() => {
    if (!generating) return;
    const t = setInterval(() => setWaitIx((i) => (i + 1) % WAITING.length), 1800);
    return () => clearInterval(t);
  }, [generating]);

  const generate = useCallback(async (withTone: string = tone) => {
    setGenerating(true);
    setGenError("");
    setEditing(false);
    try {
      const r = await api<{ confession: string; tone: string; remaining: number }>("/guided/generate", {
        body: {
          craving: a.craving === "custom" ? null : a.craving,
          craving_custom: a.craving === "custom" ? a.cravingCustom.trim() : null,
          age: Number(a.age),
          gender: a.gender,
          area: a.area.trim(),
          looking_for: a.lookingFor,
          age_min: a.ageMin ? Number(a.ageMin) : null,
          age_max: a.ageMax ? Number(a.ageMax) : null,
          connection: a.connection,
          traits: a.traits,
          secret: a.secret.trim() || null,
          hosting: a.hosting,
          public_first: a.publicFirst,
          tone: withTone,
          previous: drafts,
        },
      });
      setText(r.confession);
      setAiText(r.confession);
      setTone(r.tone);
      setDrafts((d) => [...d, r.confession].slice(-4));
      setWriter((w) => ({ ...w, remaining: r.remaining }));
    } catch (e) {
      if (e instanceof ApiError && e.code === "age_verification_required") { setAgeGate(true); return; }
      if (e instanceof ApiError && e.status === 503) setWriter((w) => ({ ...w, enabled: false }));
      setGenError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }, [a, drafts, tone]);

  // First arrival at the reveal writes the first draft on its own.
  useEffect(() => {
    if (step === 5 && writer.enabled && !text && !generating && !genError) generate();
  }, [step, writer.enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  async function publish() {
    const body = text.trim();
    if (!body) return;
    setPosting(true);
    setError("");
    try {
      await api("/drops", {
        body: {
          kind: "hookup",
          confession: body,
          hookup: {
            age: Number(a.age),
            ...(a.gender ? { gender: a.gender } : {}),
            area: a.area.trim(),
            looking_for: a.lookingFor,
            age_min: a.ageMin ? Number(a.ageMin) : null,
            age_max: a.ageMax ? Number(a.ageMax) : null,
            vibes: a.connection,
            guided: {
              craving: a.craving === "custom" ? null : a.craving,
              craving_custom: a.craving === "custom" ? a.cravingCustom.trim() : null,
              traits: a.traits,
              hosting: a.hosting,
              public_first: a.publicFirst,
              tone: aiText ? tone : null,
              ai_generated: !!aiText,
              edited: !!aiText && body !== aiText.trim(),
            },
          },
          mood_tag: "longing",
          sensitivity: "mature",
          publisher_opt_in: true,
        },
      });
      try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
      refresh();
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === "age_verification_required") { setAgeGate(true); return; }
      setError((e as Error).message);
    } finally {
      setPosting(false);
    }
  }

  if (done) {
    return (
      <div className="empty">
        <h2>It&apos;s out there.</h2>
        <p>Someone is about to read your secret. Nobody knows it&apos;s you.</p>
        <div className="row"><button className="pill" onClick={() => router.push("/")}>Back to the feed</button></div>
      </div>
    );
  }
  if (ageGate) return <div className="form pad"><AgeGate onDone={() => setAgeGate(false)} /></div>;

  const onReveal = step === 5;
  const problem = onReveal ? "" : stepProblem(step, a);
  const go = (n: number) => { setStep(n); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const writerOff = writer.enabled === false;
  const short = (user?.coin_balance ?? 0) < COST.post;
  const tags = [
    `${a.age || "—"}${a.gender && a.gender !== "other" ? ` · ${a.gender}` : ""}`,
    a.area.trim() || null,
    `into ${a.lookingFor === "anyone" ? "anyone" : a.lookingFor === "woman" ? "women" : "men"}${a.ageMin || a.ageMax ? ` ${a.ageMin || 18}–${a.ageMax || 99}` : ""}`,
    (a.hosting && HOSTING_TAG[a.hosting]) || null,
    a.publicFirst ? "public first" : null,
  ].filter(Boolean) as string[];

  function body() {
    switch (step) {
      case 0: return (
        <>
          <Chips label="Craving" options={[...CRAVINGS, ["custom", "Something else"] as [string, string]]} isOn={(k) => a.craving === k} onPick={(k) => set({ craving: k })} />
          {a.craving === "custom" ? (
            <input className="hk-field" autoFocus maxLength={40} value={a.cravingCustom} onChange={(e) => set({ cravingCustom: e.target.value })} placeholder="Say it in a few words" aria-label="What you've been craving" />
          ) : null}
        </>
      );
      case 1: return (
        <>
          <h3 className="gc-label">I&apos;m drawn to</h3>
          <Chips label="Looking for" options={LOOKING} isOn={(k) => a.lookingFor === k} onPick={(k) => set({ lookingFor: k })} />
          <h3 className="gc-label">Aged <span className="hk-opt">optional</span></h3>
          <div className="hk-range">
            <input className="hk-field" inputMode="numeric" value={a.ageMin} onChange={(e) => set({ ageMin: digits(e.target.value) })} placeholder="18" aria-label="Youngest age" />
            to
            <input className="hk-field" inputMode="numeric" value={a.ageMax} onChange={(e) => set({ ageMax: digits(e.target.value) })} placeholder="99" aria-label="Oldest age" />
          </div>
          <h3 className="gc-label">Where they can find you</h3>
          <input className="hk-field" maxLength={60} value={a.area} onChange={(e) => set({ area: e.target.value })} placeholder="A neighbourhood or city" aria-label="Where you are" />
          <p className="hk-hint">Never your exact address.</p>
          <h3 className="gc-label">What kind of connection <span className="hk-opt">optional</span></h3>
          <Chips label="Connection" options={CONNECTION} isOn={(k) => a.connection.includes(k)} onPick={(k) => set({ connection: toggleIn(a.connection, k, 3) })} />
        </>
      );
      case 2: return (
        <>
          <div className="hk-you">
            <input className="hk-field hk-age" inputMode="numeric" value={a.age} onChange={(e) => set({ age: digits(e.target.value) })} placeholder="Age" aria-label="Your age" />
            <Chips label="I am" options={GENDERS} isOn={(k) => a.gender === k} onPick={(k) => set({ gender: a.gender === k ? null : k })} />
          </div>
          <h3 className="gc-label">I&apos;m <span className="hk-opt">optional · {a.traits.length}/3</span></h3>
          <Chips label="Traits" options={TRAITS} isOn={(k) => a.traits.includes(k)} onPick={(k) => set({ traits: toggleIn(a.traits, k, 3) })} />
        </>
      );
      case 3: return (
        <>
          <div className="gc-secret">
            <textarea rows={4} maxLength={200} value={a.secret} onChange={(e) => set({ secret: e.target.value })} placeholder="I hum when I cook. I've never been kissed in the rain…" aria-label="Something they wouldn't know" />
            <span>{200 - a.secret.length}</span>
          </div>
          <p className="hk-hint">No names, numbers or socials. This only shapes your confession.</p>
        </>
      );
      case 4: return (
        <>
          <Chips label="Hosting" options={HOSTING} isOn={(k) => a.hosting === k} onPick={(k) => set({ hosting: a.hosting === k ? null : k })} />
          <label className="gc-check">
            <input type="checkbox" checked={a.publicFirst} onChange={(e) => set({ publicFirst: e.target.checked })} />
            Somewhere public first
          </label>
          <p className="hk-hint">Nobody pays anybody on Anonixx. Link up is how you meet.</p>
        </>
      );
      default: return null;
    }
  }

  return (
    <div className="form pad gc">
      <div className="gc-top">
        <button type="button" className="linkish" onClick={() => (step === 0 ? onBack() : go(step - 1))}>← {step === 0 ? "Change" : "Back"}</button>
        <div className="gc-progress" aria-label={onReveal ? "Reveal" : `Step ${step + 1} of 5`}>
          {STEPS.map((_, i) => <i key={i} className={i <= step ? "on" : ""} />)}
        </div>
      </div>

      <div className="gc-step" key={step}>
        <h2 className="gc-q">{onReveal ? "This is how it reads." : STEPS[step].q}</h2>
        <p className="gc-sub">{onReveal ? "Tone it, tweak it, or say it yourself. It stays anonymous either way." : STEPS[step].sub}</p>

        {!onReveal ? body() : (
          <>
            <div className="gc-card">
              <span className="gc-kicker">your confession</span>
              {generating ? (
                <p className="gc-wait">{WAITING[waitIx]}</p>
              ) : editing || writerOff || (!text && genError) ? (
                <textarea rows={6} maxLength={MAX} value={text} autoFocus={editing} onChange={(e) => setText(e.target.value)} placeholder="Say it the way you'd whisper it to them…" aria-label="Your confession" />
              ) : (
                <p className="gc-text">{text}</p>
              )}
              <div className="gc-tags">{tags.map((t) => <span key={t}>{t}</span>)}</div>
            </div>
            {genError ? <p className="hk-missing">{genError}</p> : null}
            {writerOff ? <p className="hk-hint">Write it yourself. Your answers are saved if you want to step back.</p> : null}
            {!writerOff && writer.enabled !== null ? (
              <>
                <h3 className="gc-label">Make it more me</h3>
                <Chips label="Tone" options={TONES} isOn={(k) => tone === k && !!aiText} onPick={(k) => { if (!generating) { setTone(k); generate(k); } }} />
                <div className="gc-actions">
                  <button type="button" className="pill" disabled={generating || !text} onClick={() => setEditing((v) => !v)}>{editing ? "Done" : "Edit"}</button>
                  <button type="button" className="pill" disabled={generating} onClick={() => generate()}>Regenerate</button>
                </div>
                {writer.remaining != null ? <p className="hk-hint">{writer.remaining} drafts left today.</p> : null}
              </>
            ) : null}
          </>
        )}
      </div>

      {error ? <div className="err">{error}</div> : null}
      <div className="hk-foot">
        {onReveal ? (
          <>
            <button className="btn" disabled={!text.trim() || posting || generating} onClick={publish}>{posting ? "Dropping…" : `Drop it · ${COST.post} coins`}</button>
            <p className="muted small">
              18+ only. Free with a subscription. You have {user?.coin_balance ?? 0} coins.
              {short ? <> <Link href="/coins">Get coins</Link></> : null}
            </p>
          </>
        ) : (
          <>
            <button className="btn" disabled={!!problem} onClick={() => go(step + 1)}>{step === 4 ? "Reveal it" : step === 3 && !a.secret.trim() ? "Skip" : "Next"}</button>
            {problem ? <p className="hk-missing">{problem}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}
