"use client";
// Promote a drop or your Room, step by step: what, the ad, who sees it, budget, review and pay.
// Paid per view from a budget held up front (backend ads.py /ads/campaigns).
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import useDraft from "@/lib/useDraft";
import { uploadFile, type UploadKind } from "@/lib/upload";
import AppShell from "./AppShell";
import "@/app/money.css";

type MyDrop = { id: string; confession: string | null; media_type?: string | null };
type Rules = { coins_per_1000: number; min_budget: number; ctas: string[]; can_advertise: boolean; reason: string | null };

const STEPS = ["Promote", "Your ad", "Audience", "Budget", "Review"] as const;
const BUDGETS = [50, 100, 250, 500, 1000];
const GENDERS = [{ id: "female", label: "Women" }, { id: "male", label: "Men" }, { id: "nonbinary", label: "Non-binary" }];

function Inner() {
  const { refresh, user } = useAuth();
  const [rules, setRules] = useState<Rules | null>(null);
  const [drops, setDrops] = useState<MyDrop[] | null>(null);
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState<"drop" | "room">("drop");
  const [dropId, setDropId] = useState("");
  const [title, setTitle, clearTitle] = useDraft("ad:title", "");
  const [cta, setCta] = useState("Link Up");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [countries, setCountries] = useState("");
  const [genders, setGenders] = useState<string[]>([]);
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [budget, setBudget] = useState(100);
  const [daily, setDaily] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needCoins, setNeedCoins] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api<Rules>("/ads/campaigns/rules").then(setRules).catch(() => {});
    api<{ drops: MyDrop[] }>("/ads/my-drops").then((r) => setDrops(r.drops)).catch(() => setDrops([]));
  }, []);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const rate = rules?.coins_per_1000 ?? 50;
  const views = Math.floor((budget * 1000) / rate);
  const balance = user?.coin_balance ?? 0;

  function check(): string {
    if (step === 0 && target === "drop" && !dropId) return "Pick the drop you want to promote.";
    if (step === 1 && !title.trim()) return "Write what your ad says.";
    if (step === 1 && target === "room" && !file) return "Add a photo or video for your Room ad.";
    if (step === 2 && ageMin && ageMax && Number(ageMin) > Number(ageMax)) return "The youngest age has to be under the oldest.";
    if (step === 3 && budget < (rules?.min_budget ?? 50)) return `The smallest budget is ${rules?.min_budget ?? 50} coins.`;
    return "";
  }

  function next() {
    const why = check();
    setError(why);
    if (!why) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function submit() {
    setBusy(true); setError(""); setNeedCoins(false);
    try {
      let media_url: string | null = null;
      let media_type = "image";
      if (file) {
        media_type = file.type === "image/gif" ? "gif" : file.type.startsWith("video/") ? "video" : "image";
        media_url = await uploadFile(file, (media_type === "video" ? "video" : "image") as UploadKind);
      }
      await api("/ads/campaigns", {
        body: {
          target_type: target, drop_id: target === "drop" ? dropId : null, title: title.trim(), cta, media_url, media_type,
          countries: countries.split(",").map((c) => c.trim()).filter(Boolean), genders,
          age_min: ageMin ? Number(ageMin) : null, age_max: ageMax ? Number(ageMax) : null,
          budget_coins: budget, daily_coins: daily ? Number(daily) : null,
        },
      });
      clearTitle();
      refresh();
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 402 || e.code === "coins_short")) setNeedCoins(true);
      setError((e as Error).message);
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="empty">
        <h2>Ad sent for review</h2>
        <p>{budget} coins are held. It goes live once we approve it. Rejected, every coin comes back. Stop it any time and the unused coins come back.</p>
        <div className="row"><Link href="/ads" className="pill">See my ads</Link></div>
      </div>
    );
  }
  if (rules && !rules.can_advertise) {
    return <div className="empty"><h2>Not yet</h2><p>{rules.reason}</p><div className="row"><Link href="/" className="pill">Back to feed</Link></div></div>;
  }

  const selected = drops?.find((d) => d.id === dropId);
  return (
    <div className="pad form">
      <ol className="ad-steps" aria-label="Steps">
        {STEPS.map((s, i) => <li key={s} className={i === step ? "on" : i < step ? "done" : ""}>{s}</li>)}
      </ol>

      {step === 0 ? (
        <>
          <h3>What do you want to promote?</h3>
          <div className="chips">
            <button type="button" className={target === "drop" ? "on" : ""} onClick={() => { setTarget("drop"); setCta("Link Up"); }}>A drop</button>
            <button type="button" className={target === "room" ? "on" : ""} onClick={() => { setTarget("room"); setCta("Visit my Room"); }}>My Room</button>
          </div>
          {target === "drop" ? (
            <label className="field">Your drop
              <select value={dropId} onChange={(e) => setDropId(e.target.value)}>
                <option value="">{drops === null ? "Loading…" : drops.length ? "Choose a drop" : "You have no live drops"}</option>
                {(drops || []).map((d) => <option key={d.id} value={d.id}>{(d.confession || "Drop with media").slice(0, 60)}</option>)}
              </select>
            </label>
          ) : <p className="muted small">People who tap your ad land in your Room.</p>}
        </>
      ) : null}

      {step === 1 ? (
        <>
          <h3>Your ad</h3>
          <label className="field">What it says (first line shows in bold)
            <textarea rows={4} maxLength={900} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What stops the scroll?" />
          </label>
          <label className="field">{target === "drop" ? "Photo or video (blank = use the drop's)" : "Photo or video"}
            <input type="file" accept="image/*,video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          {preview && file?.type.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="preview" src={preview} alt="" />
          ) : null}
          {preview && file?.type.startsWith("video/") ? <video className="preview" src={preview} controls muted /> : null}
          <div className="field">Button
            <div className="chips">
              {(rules?.ctas || ["Link Up", "See more", "Visit my Room"]).map((c) => <button type="button" key={c} className={c === cta ? "on" : ""} onClick={() => setCta(c)}>{c}</button>)}
            </div>
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <h3>Who sees it</h3>
          <p className="muted small">Leave anything blank to reach everyone.</p>
          <div className="field">Gender
            <div className="chips">
              {GENDERS.map((g) => (
                <button type="button" key={g.id} className={genders.includes(g.id) ? "on" : ""}
                  onClick={() => setGenders((cur) => (cur.includes(g.id) ? cur.filter((x) => x !== g.id) : [...cur, g.id]))}>{g.label}</button>
              ))}
            </div>
          </div>
          <div className="ad-row">
            <label className="field">Age from<input inputMode="numeric" value={ageMin} onChange={(e) => setAgeMin(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="18" /></label>
            <label className="field">to<input inputMode="numeric" value={ageMax} onChange={(e) => setAgeMax(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Any" /></label>
          </div>
          <label className="field">Countries
            <input value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="Everywhere, or e.g. Kenya, Nigeria" />
          </label>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <h3>Budget</h3>
          <div className="chips">
            {BUDGETS.map((b) => <button type="button" key={b} className={b === budget ? "on" : ""} onClick={() => setBudget(b)}>{b} coins</button>)}
          </div>
          <p className="ad-est">About <b>{views.toLocaleString()}</b> views</p>
          <p className="muted small">{rate} coins per 1,000 views. You pay only for views you get; whatever is left comes back when you stop the ad.</p>
          <label className="field">Daily limit (optional)
            <input inputMode="numeric" value={daily} onChange={(e) => setDaily(e.target.value.replace(/\D/g, ""))} placeholder="Coins per day" />
          </label>
        </>
      ) : null}

      {step === 4 ? (
        <>
          <h3>Review</h3>
          <dl className="ad-review">
            <dt>Promoting</dt><dd>{target === "room" ? "Your Room" : (selected?.confession || "Your drop").slice(0, 80)}</dd>
            <dt>Says</dt><dd style={{ whiteSpace: "pre-line" }}>{title}</dd>
            <dt>Button</dt><dd>{cta}</dd>
            <dt>Audience</dt><dd>{[genders.length ? genders.map((g) => GENDERS.find((x) => x.id === g)?.label).join(", ") : "Everyone", ageMin || ageMax ? `${ageMin || 18}–${ageMax || "any"}` : "", countries || "everywhere"].filter(Boolean).join(" · ")}</dd>
            <dt>Budget</dt><dd>{budget} coins · about {views.toLocaleString()} views{daily ? ` · up to ${daily} a day` : ""}</dd>
            <dt>Your coins</dt><dd>{balance}</dd>
          </dl>
          <p className="muted small">We review every ad before it runs. Rejected, every coin comes back.</p>
        </>
      ) : null}

      {error ? <div className="err">{error}</div> : null}
      {needCoins ? <Link href="/coins" className="pill">Get coins</Link> : null}
      <div className="row">
        {step > 0 ? <button type="button" className="pill" onClick={() => { setError(""); setStep(step - 1); }} disabled={busy}>Back</button> : null}
        {step < STEPS.length - 1
          ? <button type="button" className="btn" onClick={next}>Next</button>
          : <button type="button" className="btn" onClick={submit} disabled={busy}>{busy ? "Sending…" : `Send for review · ${budget} coins`}</button>}
      </div>
    </div>
  );
}

export default function CreateAdPage() {
  return <AppShell title="New ad" back="/ads"><Inner /></AppShell>;
}
