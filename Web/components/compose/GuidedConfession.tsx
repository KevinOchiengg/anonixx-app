"use client";
/** Guided hookup composer: five short sections on one page with a live preview of the
 * confession, then a review to tweak it (or let the AI writer reword it), add a sound and post.
 * Progress is saved as it changes. Same as the app's GuidedConfession.jsx. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, COST, type Sound } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { hookupDraft, FRESH_FOR_WHEN, MEET_WHEN, WANTS, type DraftAnswers } from "@/lib/hookupDraft";
import AgeGate from "../AgeGate";

export const GUIDED_SAVE_KEY = "anonixx.drops.guided.v1";
// The poster's own age, remembered after their first hookup post so it's filled in next time.
const MY_AGE_KEY = "anonixx.hookup.age";
const SAVE_KEY = GUIDED_SAVE_KEY;
const MAX = 500;
const NOTE_MAX = 200;
const CLARITY_MAX = 120; // "Expectations", same cap as the API

// Ids must match HOOKUP_* in Backend/app/api/v1/drops.py.
const GENDERS: [string, string][] = [["woman", "woman"], ["man", "man"], ["other", "person"]];
const LOOKING: [string, string][] = [["man", "man"], ["woman", "woman"], ["anyone", "anyone"]];
const TONES: [string, string][] = [["vulnerable", "Vulnerable"], ["playful", "Playful"], ["mysterious", "Mysterious"], ["direct", "Direct"]];
const FRESH_HINT: Record<string, string> = {
  tonight: "It's up for 12 hours. You can add more, up to 2 days.",
  week: "It's up for 7 days.",
  flexible: "It's up for 7 days. Renew it when it runs out.",
};
const WAITING = ["listening to what you said…", "finding your words…", "keeping it yours…"];

type Answers = DraftAnswers & { sound: string; soundOff: boolean };
const EMPTY: Answers = {
  age: "", gender: null, area: "", appearance: "",
  lookingFor: "anyone", ageMin: "", ageMax: "",
  wants: [],
  when: "tonight", hosting: null, publicFirst: false,
  note: "", want: "", dontWant: "",
  sound: "", soundOff: false,   // the sound is picked at random unless they turn it off
};

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 2);
const toggleIn = (list: string[], v: string, max: number) => (list.includes(v) ? list.filter((x) => x !== v) : list.length < max ? [...list, v] : list);

// What still stops them continuing (only "About me" is required).
function formProblem(a: Answers): string {
  const age = Number(a.age);
  if (!a.age) return "Add your age.";
  if (age < 18) return "You have to be 18 or older to post here.";
  if (age > 99) return "Enter a real age.";
  if (!a.area.trim()) return "Add where you are.";
  const lo = Number(a.ageMin), hi = Number(a.ageMax);
  if ((a.ageMin && lo < 18) || (a.ageMax && hi < 18)) return "Everyone here is 18+, so start at 18.";
  return "";
}

// The age they want: one age ("30") or a range ("28–35"). One box filled = that exact age.
const wantedRange = (a: Answers): [number | null, number | null] => {
  const lo = a.ageMin ? Number(a.ageMin) : null;
  const hi = a.ageMax ? Number(a.ageMax) : null;
  const [x, y] = [lo ?? hi, hi ?? lo];
  return x != null && y != null && x > y ? [y, x] : [x, y];
};

function Chips({ options, isOn, onPick, label }: { options: [string, string][]; isOn: (k: string) => boolean; onPick: (k: string) => void; label: string }) {
  return (
    <div className="chips gc-chips" role="group" aria-label={label}>
      {options.map(([k, l]) => (
        <button type="button" key={k} aria-pressed={isOn(k)} className={isOn(k) ? "on" : ""} onClick={() => onPick(k)}>{l}</button>
      ))}
    </div>
  );
}

function Section({ n, title, sub, done, optional, children }: { n?: number; title: string; sub?: string; done: boolean; optional?: boolean; children: React.ReactNode }) {
  return (
    <section className="gc-section">
      <header>
        <span className={`gc-num${done ? " done" : ""}`} aria-hidden>{done ? "✓" : n || "+"}</span>
        <div>
          <h3>{n ? `${n}. ` : ""}{title.toUpperCase()}{optional ? <span className="hk-opt"> optional</span> : null}</h3>
          {sub ? <p className="hk-hint">{sub}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

export default function GuidedConfession({ onBack }: { onBack: () => void }) {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [a, setA] = useState<Answers>(EMPTY);
  const [phase, setPhase] = useState<"form" | "review">("form");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1000));
  const [ready, setReady] = useState(false);
  const set = (patch: Partial<Answers>) => setA((cur) => ({ ...cur, ...patch }));

  const [writer, setWriter] = useState<{ enabled: boolean | null; remaining: number | null }>({ enabled: null, remaining: null });
  const [text, setText] = useState("");
  const [baseText, setBaseText] = useState("");   // what the review started from, to tell edits apart
  const [tone, setTone] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [aiText, setAiText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [ageGate, setAgeGate] = useState(false);
  const [waitIx, setWaitIx] = useState(0);
  const [done, setDone] = useState(false);
  const [sounds, setSounds] = useState<Sound[] | null>(null);
  const [hearing, setHearing] = useState("");
  const preview = useRef<HTMLAudioElement | null>(null);

  const draft = useMemo(() => hookupDraft(a, seed), [a, seed]);

  // A random sound behind it, unless they chose "No sound". Shuffle rolls another.
  const shuffleSound = useCallback(() => {
    if (!sounds?.length) return;
    setA((cur) => {
      const pool = sounds.length > 1 ? sounds.filter((x) => x.id !== cur.sound) : sounds;
      return { ...cur, sound: pool[Math.floor(Math.random() * pool.length)].id, soundOff: false };
    });
  }, [sounds]);
  useEffect(() => {
    if (!ready || !sounds?.length || a.soundOff) return;
    if (!a.sound || !sounds.some((x) => x.id === a.sound)) shuffleSound();
  }, [ready, sounds, a.sound, a.soundOff, shuffleSound]);
  const problem = formProblem(a);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (saved?.a) setA({ ...EMPTY, ...saved.a, wants: Array.isArray(saved.a.wants) ? saved.a.wants : [] });
      if (saved?.phase === "review") setPhase("review");
      if (typeof saved?.seed === "number") setSeed(saved.seed);
      if (typeof saved?.text === "string") setText(saved.text);
      if (typeof saved?.baseText === "string") setBaseText(saved.baseText);
      if (typeof saved?.aiText === "string") setAiText(saved.aiText);
      if (typeof saved?.tone === "string") setTone(saved.tone);
      if (Array.isArray(saved?.drafts)) setDrafts(saved.drafts.slice(-4));
      const myAge = localStorage.getItem(MY_AGE_KEY);
      if (myAge && /^\d{2}$/.test(myAge)) setA((cur) => (cur.age ? cur : { ...cur, age: myAge }));
    } catch { /* storage unavailable or corrupt */ }
    setReady(true);
    api<{ enabled: boolean; remaining: number }>("/guided/status")
      .then((r) => setWriter({ enabled: r.enabled, remaining: r.remaining }))
      .catch(() => setWriter({ enabled: false, remaining: null }));
    api<{ sounds?: Sound[] }>("/sounds").then((r) => setSounds(r.sounds || [])).catch(() => setSounds([]));
  }, []);

  // A sound preview stops when the poster leaves the review or the page.
  useEffect(() => {
    if (phase === "review") return;
    preview.current?.pause();
    setHearing("");
  }, [phase]);
  useEffect(() => () => preview.current?.pause(), []);
  function hear(s: Sound) {
    preview.current?.pause();
    if (hearing === s.id) { setHearing(""); return; }
    const el = new Audio(s.url);
    el.onended = () => setHearing("");
    el.play().catch(() => setHearing(""));
    preview.current = el;
    setHearing(s.id);
  }

  useEffect(() => {
    if (!ready || done) return;
    const t = setTimeout(() => {
      const started = phase !== "form" || !!text || JSON.stringify(a) !== JSON.stringify(EMPTY);
      try {
        if (started) localStorage.setItem(SAVE_KEY, JSON.stringify({ started, a, phase, seed, text, baseText, aiText, tone, drafts }));
        else localStorage.removeItem(SAVE_KEY);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [a, phase, seed, text, baseText, aiText, tone, drafts, ready, done]);

  useEffect(() => {
    if (!generating) return;
    const t = setInterval(() => setWaitIx((i) => (i + 1) % WAITING.length), 1800);
    return () => clearInterval(t);
  }, [generating]);

  const generate = useCallback(async (withTone: string) => {
    setGenerating(true);
    setGenError("");
    try {
      const [lo, hi] = wantedRange(a);
      const r = await api<{ confession: string; tone: string; remaining: number }>("/guided/generate", {
        body: {
          age: Number(a.age),
          gender: a.gender,
          area: a.area.trim(),
          appearance: a.appearance.trim() || null,
          looking_for: a.lookingFor,
          age_min: lo,
          age_max: hi,
          connection: a.wants,
          meet_when: a.when,
          hosting: a.hosting,
          public_first: a.publicFirst,
          secret: a.note.trim() || null,
          want: a.want.trim() || null,
          dont_want: a.dontWant.trim() || null,
          tone: withTone,
          previous: drafts,
        },
      });
      setText(r.confession);
      setBaseText(r.confession);
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
  }, [a, drafts]);

  function toReview() {
    if (problem) return;
    // Keep their own edits; otherwise start from the live draft as it is now.
    if (!text.trim() || text === baseText) { setText(draft); setBaseText(draft); setAiText(""); }
    setPhase("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(phase === "review" ? text : draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked: nothing to do */ }
  }

  async function publish() {
    const body = text.trim();
    if (!body) return;
    setPosting(true);
    setError("");
    try {
      const [lo, hi] = wantedRange(a);
      await api("/drops", {
        body: {
          kind: "hookup",
          confession: body,
          hookup: {
            age: Number(a.age),
            ...(a.gender ? { gender: a.gender } : {}),
            area: a.area.trim(),
            looking_for: a.lookingFor,
            age_min: lo,
            age_max: hi,
            vibes: a.wants,
            fresh_window: FRESH_FOR_WHEN[a.when] || "tonight",
            guided: {
              appearance: a.appearance.trim() || null,
              meet_when: a.when,
              hosting: a.hosting,
              public_first: a.publicFirst,
              want: a.want.trim() || null,
              dont_want: a.dontWant.trim() || null,
              tone: aiText ? tone : null,
              ai_generated: !!aiText,
              edited: body !== baseText.trim(),
            },
          },
          mood_tag: "longing",
          sensitivity: "mature",
          publisher_opt_in: true,
          ...(a.sound ? { sound_id: a.sound } : {}),
        },
      });
      try { localStorage.removeItem(SAVE_KEY); localStorage.setItem(MY_AGE_KEY, a.age); } catch { /* ignore */ }
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

  const onReview = phase === "review";
  const short = (user?.coin_balance ?? 0) < COST.post;
  const sections = [
    !problem,
    !!a.ageMin || !!a.ageMax || a.lookingFor !== "anyone",
    a.wants.length > 0,
    !!a.when,
    !!a.note.trim(),
  ];
  const doneCount = sections.filter(Boolean).length;
  const pickedSound = a.sound ? sounds?.find((x) => x.id === a.sound) : undefined;

  return (
    <div className="form pad gc">
      <div className="gc-top">
        <button type="button" className="linkish" onClick={() => (onReview ? setPhase("form") : onBack())}>← {onReview ? "Back" : "Change"}</button>
        <div className="gc-progress" aria-label={onReview ? "Ready to drop" : `${doneCount} of 5 sections filled`}>
          {sections.map((on, i) => <i key={i} className={onReview || on ? "on" : ""} />)}
        </div>
      </div>

      {!onReview ? (
        <>
          <Section n={1} title="About me" done={sections[0]}>
            <div className="gc-row gc-lead"><span>I&apos;m a</span><Chips label="I am" options={GENDERS} isOn={(k) => a.gender === k} onPick={(k) => set({ gender: a.gender === k ? null : k })} /></div>
            <label className="gc-field"><span>Age</span>
              <input className="hk-field gc-age" inputMode="numeric" value={a.age} onChange={(e) => set({ age: digits(e.target.value) })} placeholder="Your age" />
            </label>
            <label className="gc-field"><span>Location</span>
              <input className="hk-field" maxLength={60} value={a.area} onChange={(e) => set({ area: e.target.value })} placeholder="Your town or area" />
            </label>
            <label className="gc-field"><span>Appearance <span className="hk-opt">optional</span></span>
              <input className="hk-field" maxLength={60} value={a.appearance} onChange={(e) => set({ appearance: e.target.value })} placeholder="How would you describe yourself?" />
            </label>
            <p className="hk-hint">Only your age and area show on your card.</p>
          </Section>

          <Section n={2} title="Who I'm looking for" done={sections[1]}>
            <div className="gc-row gc-lead"><span>I&apos;m looking for</span><Chips label="Looking for" options={LOOKING} isOn={(k) => a.lookingFor === k} onPick={(k) => set({ lookingFor: k })} /></div>
            <div className="gc-field"><span>Preferred age range <span className="hk-opt">optional</span></span>
              <div className="gc-row gc-range">
                <input className="hk-field gc-age" inputMode="numeric" value={a.ageMin} onChange={(e) => set({ ageMin: digits(e.target.value) })} placeholder="Min" aria-label="Minimum age" />
                <span>to</span>
                <input className="hk-field gc-age" inputMode="numeric" value={a.ageMax} onChange={(e) => set({ ageMax: digits(e.target.value) })} placeholder="Max" aria-label="Maximum age" />
              </div>
            </div>
          </Section>

          <Section n={3} title="What I'm looking for" sub="Tick up to three." done={sections[2]}>
            <div className="gc-checks" role="group" aria-label="What you're looking for">
              {WANTS.filter(([k]) => k !== "on our terms").map(([k, l]) => (
                <label key={k} className={`gc-checkrow${a.wants.includes(k) ? " on" : ""}`}>
                  <input type="checkbox" checked={a.wants.includes(k)} onChange={() => set({ wants: toggleIn(a.wants, k, 3) })} />
                  {l}
                </label>
              ))}
            </div>
          </Section>

          <Section n={4} title="When I'd like to meet" sub={FRESH_HINT[FRESH_FOR_WHEN[a.when]]} done={sections[3]}>
            <div className="gc-checks" role="radiogroup" aria-label="When">
              {MEET_WHEN.map(([k, l]) => (
                <label key={k} className={`gc-checkrow${a.when === k ? " on" : ""}`}>
                  <input type="radio" name="gc-when" checked={a.when === k} onChange={() => set({ when: k })} />
                  {l}
                </label>
              ))}
            </div>
          </Section>

          <Section n={5} title="Anything else?" optional done={sections[4]}>
            <div className="gc-secret">
              <textarea rows={3} maxLength={NOTE_MAX} value={a.note} onChange={(e) => set({ note: e.target.value })} placeholder="Write something personal you'd like them to know." aria-label="Anything else (optional)" />
              <span>{NOTE_MAX - a.note.length}</span>
            </div>
          </Section>

          <Section title="Expectations" optional done={!!a.want.trim()}>
            <input className="hk-field" maxLength={CLARITY_MAX} value={a.want} onChange={(e) => set({ want: e.target.value })} placeholder="Add any expectations or details." aria-label="Expectations (optional)" />
            <p className="hk-hint">No names, numbers, socials or money. Link up is how you meet.</p>
          </Section>

          {/* Live preview, right under Expectations: scrolls with the form and rewrites itself as they answer. */}
          <div className="gc-card gc-live" aria-live="polite">
            <div className="gc-live-head">
              <span className="gc-kicker">live preview</span>
              <button type="button" className="gc-hear" onClick={() => setSeed((x) => x + 1)}>↻ new wording</button>
            </div>
            <p className="gc-text">{draft}</p>
          </div>
        </>
      ) : (
        <div className="gc-step">
          <h2 className="gc-q">This is how it reads.</h2>
          <p className="gc-sub">Change any word. It stays anonymous either way.</p>
          <div className="gc-card">
            <span className="gc-kicker">your confession</span>
            {generating ? <p className="gc-wait">{WAITING[waitIx]}</p> : (
              <textarea rows={7} maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="Say it the way you'd whisper it to them…" aria-label="Your confession" />
            )}
            <span className="hk-hint" style={{ justifySelf: "end" }}>{MAX - text.length}</span>
          </div>
          {genError ? <p className="hk-missing">{genError}</p> : null}
          {writer.enabled ? (
            <>
              <h3 className="gc-label">Reword it for me <span className="hk-opt">optional</span></h3>
              <Chips label="Tone" options={TONES} isOn={(k) => tone === k && !!aiText} onPick={(k) => { if (!generating) generate(k); }} />
              {writer.remaining != null ? <p className="hk-hint">{writer.remaining} rewordings left today.</p> : null}
            </>
          ) : null}
          <h3 className="gc-label">A sound behind it</h3>
          {sounds === null ? <p className="hk-hint">Loading sounds…</p> : sounds.length === 0 ? (
            <p className="hk-hint">No sounds yet. Yours goes out quiet, which works too.</p>
          ) : (
            <>
              <div className="chips gc-chips gc-sounds" role="group" aria-label="Sound">
                {pickedSound ? (
                  <span className="gc-sound">
                    <button type="button" className="on" onClick={() => hear(pickedSound)}>♪ {pickedSound.title}</button>
                    <button type="button" className="gc-hear" onClick={() => hear(pickedSound)} aria-label={hearing === pickedSound.id ? `Stop ${pickedSound.title}` : `Listen to ${pickedSound.title}`}>{hearing === pickedSound.id ? "stop" : "listen"}</button>
                  </span>
                ) : null}
                <button type="button" onClick={shuffleSound}>{pickedSound ? "Shuffle" : "Pick one for me"}</button>
                <button type="button" aria-pressed={!a.sound} className={!a.sound ? "on" : ""} onClick={() => { preview.current?.pause(); setHearing(""); set({ sound: "", soundOff: true }); }}>No sound</button>
              </div>
              <p className="hk-hint">{pickedSound ? "Picked at random. It plays softly while they read yours." : "Yours goes out quiet."}</p>
            </>
          )}
          <p className="hk-hint">{FRESH_HINT[FRESH_FOR_WHEN[a.when]]} Your Room and chats stay either way.{pickedSound ? `  ♪ ${pickedSound.title}` : ""}</p>
        </div>
      )}

      {error ? <div className="err">{error}</div> : null}
      <div className="gc-dock">
      <div className="hk-foot">
        <div className="gc-foot-row">
          <button type="button" className="pill" disabled={onReview ? !text.trim() : !!problem} onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          {onReview ? (
            <button className="btn" disabled={!text.trim() || posting || generating} onClick={publish}>{posting ? "Dropping…" : `Drop it · ${COST.post} coins`}</button>
          ) : (
            <button className="btn" disabled={!!problem} onClick={toReview}>Continue</button>
          )}
        </div>
        {onReview ? (
          <p className="muted small">
            18+ only. Free with a subscription. You have {user?.coin_balance ?? 0} coins.
            {short ? <> <Link href="/coins">Get coins</Link></> : null}
          </p>
        ) : (
          <p className={problem ? "hk-missing" : "muted small"}>{problem || "Everything else is optional."}</p>
        )}
      </div>
      </div>
    </div>
  );
}
