"use client";
/** Guided hookup composer: five short sections on one page: the answers for the
 * card, the confession in their own words and the live preview, all on one page. The server picks the sound.
 * Progress is saved as it changes. Same as the app's GuidedConfession.jsx. */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, COST } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FRESH_FOR_WHEN, MEET_WHEN, WANTS, type DraftAnswers } from "@/lib/hookupDraft";
import AgeGate from "../AgeGate";
import { ConfessionPreview } from "../ConfessionCard";
import { linkUpFacts } from "@/lib/confession";

export const GUIDED_SAVE_KEY = "anonixx.drops.guided.v1";
// The poster's own age, remembered after their first hookup post so it's filled in next time.
const MY_AGE_KEY = "anonixx.hookup.age";
const SAVE_KEY = GUIDED_SAVE_KEY;
const MAX = 900;

// Ids must match HOOKUP_* in Backend/app/api/v1/drops.py.
const GENDERS: [string, string][] = [["woman", "woman"], ["man", "man"], ["other", "person"]];
const LOOKING: [string, string][] = [["man", "man"], ["woman", "woman"], ["anyone", "anyone"]];
const HOSTING: [string, string][] = [["can_host", "I can host"], ["can_travel", "You host"]];
const FRESH_HINT: Record<string, string> = {
  tonight: "It's up for 12 hours. You can add more, up to 2 days.",
  week: "It's up for 7 days.",
  flexible: "It's up for 7 days. Renew it when it runs out.",
};

type Answers = DraftAnswers;
const EMPTY: Answers = {
  age: "", gender: null, area: "",
  lookingFor: "anyone", ageMin: "", ageMax: "",
  wants: [],
  when: "tonight", hosting: null,
  note: "", want: "", dontWant: "",
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
  const [ready, setReady] = useState(false);
  const set = (patch: Partial<Answers>) => setA((cur) => ({ ...cur, ...patch }));

  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [ageGate, setAgeGate] = useState(false);
  const [done, setDone] = useState(false);

  // The chips the feed card will show, from the answers so far.
  const previewFacts = useMemo(() => {
    const [lo, hi] = wantedRange(a);
    return linkUpFacts({
      age: Number(a.age) || 0, gender: a.gender, area: a.area.trim(), looking_for: a.lookingFor,
      age_min: lo, age_max: hi, vibes: a.wants,
      guided: { craving: null, traits: [], hosting: a.hosting, tone: null, ai_generated: false, meet_when: a.when },
    }, null);
  }, [a]);

  const problem = formProblem(a);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (saved?.a) setA({ ...EMPTY, ...saved.a, wants: Array.isArray(saved.a.wants) ? saved.a.wants : [] });
      if (typeof saved?.text === "string") setText(saved.text);
      const myAge = localStorage.getItem(MY_AGE_KEY);
      if (myAge && /^\d{2}$/.test(myAge)) setA((cur) => (cur.age ? cur : { ...cur, age: myAge }));
    } catch { /* storage unavailable or corrupt */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || done) return;
    const t = setTimeout(() => {
      const started = !!text || JSON.stringify(a) !== JSON.stringify(EMPTY);
      try {
        if (started) localStorage.setItem(SAVE_KEY, JSON.stringify({ started, a, text }));
        else localStorage.removeItem(SAVE_KEY);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [a, text, ready, done]);

  async function publish() {
    const body = text.trim();
    if (!body || problem) return;
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
              meet_when: a.when,
              hosting: a.hosting,
              want: a.want.trim() || null,
              dont_want: a.dontWant.trim() || null,
              tone: null,
              ai_generated: false,
            },
          },
          mood_tag: "longing",
          sensitivity: "mature",
          publisher_opt_in: false,
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

  const short = (user?.coin_balance ?? 0) < COST.post;
  const sections = [
    !problem,
    !!a.ageMin || !!a.ageMax || a.lookingFor !== "anyone",
    a.wants.length > 0,
    !!a.when,
    !!text.trim(),
  ];
  const doneCount = sections.filter(Boolean).length;
  const missing = problem || (!text.trim() ? "Write your confession above." : "");

  return (
    <div className="form pad gc">
      <div className="gc-top">
        <button type="button" className="linkish" onClick={onBack}>← Change</button>
        <div className="gc-progress" aria-label={`${doneCount} of 5 sections filled`}>
          {sections.map((on, i) => <i key={i} className={on ? "on" : ""} />)}
        </div>
      </div>

      <Section n={1} title="About me" done={sections[0]}>
        <div className="gc-row gc-lead"><span>I&apos;m a</span><Chips label="I am" options={GENDERS} isOn={(k) => a.gender === k} onPick={(k) => set({ gender: a.gender === k ? null : k })} /></div>
        <label className="gc-field"><span>Age</span>
          <input className="hk-field gc-age" inputMode="numeric" value={a.age} onChange={(e) => set({ age: digits(e.target.value) })} placeholder="Your age" />
        </label>
        <label className="gc-field"><span>Location</span>
          <input className="hk-field" maxLength={60} value={a.area} onChange={(e) => set({ area: e.target.value })} placeholder="Your town or area" />
        </label>
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
        <h3 className="gc-label">Hosting <span className="hk-opt">optional</span></h3>
        <Chips label="Hosting" options={HOSTING} isOn={(k) => a.hosting === k} onPick={(k) => set({ hosting: a.hosting === k ? null : k })} />
      </Section>

      <Section n={5} title="Your confession" sub="Introduce yourself and say what you're looking for, in your own words. Your identity stays private." done={sections[4]}>
        <div className="gc-card">
          <textarea rows={6} maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="Hello, I'm… Say who you are, who you want and when." aria-label="Your confession" />
          <span className="hk-hint" style={{ justifySelf: "end" }}>{MAX - text.length}</span>
        </div>
      </Section>

      <p className="cc-kicker">live preview</p>
      <ConfessionPreview category="linkup" text={text} facts={previewFacts} placeholder="Your words show up here as you type." />

      {error ? <div className="err">{error}</div> : null}
      <div className="gc-dock">
        <div className="hk-foot">
          <button className="btn" disabled={!!missing || posting} onClick={publish}>{posting ? "Dropping…" : `Drop it · ${COST.post} coins`}</button>
          {missing ? <p className="hk-missing">{missing}</p> : (
            <p className="muted small">
              Stays up 7 days, then deletes itself. Link Ups you never answer are refunded. 18+ only. Free with a subscription. You have {user?.coin_balance ?? 0} coins.
              {short ? <> <Link href="/coins">Get coins</Link></> : null}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
