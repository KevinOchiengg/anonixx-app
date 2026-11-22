"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Coins, ImagePlus, Radio, CalendarClock } from "lucide-react";
import AppShell from "@/components/AppShell";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useConfirm } from "@/lib/confirm";
import { uploadFile } from "@/lib/upload";
import { livesApi, startsLabel, type PayoutProfile } from "@/lib/lives";
import PayoutForm from "./PayoutForm";
import "@/app/lives.css";

const PRICE_PRESETS = [5, 10, 20, 50];

export default function GoLivePage() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const confirm = useConfirm();
  const [profile, setProfile] = useState<PayoutProfile | null | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [about, setAbout] = useState("");
  const [price, setPrice] = useState(10);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [startsAt, setStartsAt] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ready && !user) router.replace("/login?next=/lives/new");
    if (user) livesApi.payoutProfile().then((r) => setProfile(r.profile)).catch(() => setProfile(null));
  }, [ready, user, router]);

  async function pickCover(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    try { setCover(await uploadFile(file, "image")); } catch (e) { setError((e as Error).message); } finally { setUploading(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const later = when === "later" && startsAt ? new Date(startsAt) : null;
    const ok = await confirm({
      title: later ? "Schedule this live?" : "Go live now?",
      icon: "live",
      message: later
        ? `Starts ${startsLabel(later.toISOString())}. Followers and anyone who taps Remind me get notified when you start.`
        : "Your camera and mic turn on. Viewers get a 30-second preview, then pay to stay.",
      detail: (
        <>
          <div className="cf-row"><span>Entry price</span><b className="cf-cost">{price} coins</b></div>
          <div className="cf-row"><span>You keep</span><b>80% + all gifts</b></div>
        </>
      ),
      confirmLabel: later ? "Schedule" : "Go live",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const { live } = await livesApi.create({
        title: title.trim(), about: about.trim() || undefined, cover_url: cover || undefined, price,
        starts_at: later ? later.toISOString() : null,
      });
      router.push(`/lives/${live.id}${later ? "" : "?host=1"}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "payout_profile_required") setProfile(null);
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!user || profile === undefined) return <AppShell title="Go live" back="/lives"><p className="muted lv-pad">Loading…</p></AppShell>;

  if (!profile) {
    return (
      <AppShell title="Payout details" back="/lives">
        <div className="lv-page lv-narrow">
          <h2 className="lv-h">Get paid for your lives</h2>
          <PayoutForm onSaved={setProfile} />
        </div>
      </AppShell>
    );
  }

  const minLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  return (
    <AppShell title="Go live" back="/lives">
      <form className="lv-page lv-narrow lv-form" onSubmit={submit}>
        <button type="button" className="lv-cover-pick" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {cover ? <Image src={cover} alt="" fill sizes="480px" /> : <span><ImagePlus aria-hidden />{uploading ? "Uploading…" : "Add a cover (optional)"}</span>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickCover(e.target.files?.[0])} />

        <label className="field">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} minLength={3} maxLength={80} required placeholder="What's this live about?" />
        </label>
        <label className="field">
          About <small className="muted">optional</small>
          <textarea rows={3} value={about} onChange={(e) => setAbout(e.target.value)} maxLength={300} placeholder="Tell people why they should join" />
        </label>

        <fieldset className="lv-field">
          <legend>Entry price</legend>
          <div className="lv-chips">
            {PRICE_PRESETS.map((p) => (
              <button key={p} type="button" className={price === p ? "on" : ""} onClick={() => setPrice(p)}><Coins aria-hidden />{p}</button>
            ))}
            <input type="number" min={1} max={500} value={price} onChange={(e) => setPrice(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} aria-label="Custom price in coins" />
          </div>
          <small className="muted">Everyone gets a free 30-second preview first. You keep 80% of entry fees and all gifts.</small>
        </fieldset>

        <fieldset className="lv-field">
          <legend>When</legend>
          <div className="lv-chips">
            <button type="button" className={when === "now" ? "on" : ""} onClick={() => setWhen("now")}><Radio aria-hidden />Now</button>
            <button type="button" className={when === "later" ? "on" : ""} onClick={() => setWhen("later")}><CalendarClock aria-hidden />Schedule</button>
          </div>
          {when === "later" ? <input type="datetime-local" min={minLocal} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required /> : null}
        </fieldset>

        {error ? <p className="err">{error}</p> : null}
        <button className="pill lv-submit" disabled={busy || uploading || title.trim().length < 3 || (when === "later" && !startsAt)}>
          {busy ? "Setting up…" : when === "now" ? "Go live" : "Schedule live"}
        </button>
      </form>
    </AppShell>
  );
}
