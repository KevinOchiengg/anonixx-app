"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { api } from "@/lib/api";
import { uploadFile } from "@/lib/upload";
import { Badge, fmtDate } from "@/components/admin/bits";
import AdminMedia from "@/components/admin/AdminMedia";
import { askConfirm } from "@/lib/confirm";

type Ad = {
  id: string; title: string; media_url: string | null; media_type: string; cover_url?: string | null; link_url: string;
  cta?: string; adult?: boolean; platforms?: string[]; countries?: string[]; starts_at?: string | null;
  ad_type: string; status: string; expires_at: string | null; created_at: string;
  active?: boolean; ended?: boolean; views?: number; taps?: number; likes?: number; hides?: number; tap_rate?: number;
};

const BLANK = { title: "", link_url: "", cta: "", adult: false, web: true, app: true, countries: "", starts_at: "", ends_at: "" };

function Media({ ad }: { ad: Ad }) {
  if (!ad.media_url) return null;
  if (ad.media_type === "image" || ad.media_type === "gif") return <Image src={ad.media_url} alt="" className="adm-cover" width={800} height={450} sizes="100vw" />;
  return <AdminMedia media={{ media_type: ad.media_type, media_url: ad.media_url, images: null, cover_url: ad.cover_url ?? null }} open />;
}

function NewAd({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState(BLANK);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const set = (k: keyof typeof BLANK, v: string | boolean) => setF((cur) => ({ ...cur, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      let media_url: string | null = null;
      let media_type = "image";
      if (file) {
        media_type = file.type.startsWith("video/") ? "video" : file.type === "image/gif" ? "gif" : "image";
        setBusy("Uploading…");
        media_url = await uploadFile(file, media_type === "video" ? "video" : "image");
      }
      setBusy("Saving…");
      await api("/ads/admin", {
        body: {
          title: f.title, link_url: f.link_url, cta: f.cta || null, adult: f.adult, media_url, media_type,
          platforms: [f.web && "web", f.app && "app"].filter(Boolean),
          countries: f.countries.split(",").map((c) => c.trim()).filter(Boolean),
          starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : null,
          ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null,
        },
      });
      setF(BLANK); setFile(null); onDone();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <form className="adm-card" onSubmit={submit}>
      <b>New ad</b>
      <label className="small">Caption (first line shows in bold)
        <textarea className="adm-input" rows={3} maxLength={900} value={f.title} onChange={(e) => set("title", e.target.value)} required />
      </label>
      <div className="adm-form-grid">
        <label className="small">Link
          <input className="adm-input" type="url" value={f.link_url} onChange={(e) => set("link_url", e.target.value)} placeholder="https://…" required />
        </label>
        <label className="small">Button text
          <input className="adm-input" maxLength={30} value={f.cta} onChange={(e) => set("cta", e.target.value)} placeholder="Check it out" />
        </label>
        <label className="small">Photo or video
          <input className="adm-input" type="file" accept="image/*,video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        <label className="small">Countries (blank = everywhere)
          <input className="adm-input" value={f.countries} onChange={(e) => set("countries", e.target.value)} placeholder="Kenya, Nigeria" />
        </label>
        <label className="small">Starts
          <input className="adm-input" type="datetime-local" value={f.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
        </label>
        <label className="small">Ends (blank = runs until you stop it)
          <input className="adm-input" type="datetime-local" value={f.ends_at} onChange={(e) => set("ends_at", e.target.value)} />
        </label>
      </div>
      <div className="adm-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
        <label className="small"><input type="checkbox" checked={f.web} onChange={(e) => set("web", e.target.checked)} /> Website</label>
        <label className="small"><input type="checkbox" checked={f.app} onChange={(e) => set("app", e.target.checked)} /> App</label>
        <label className="small"><input type="checkbox" checked={f.adult} onChange={(e) => set("adult", e.target.checked)} /> 18+ (only for people who said they&apos;re 18+)</label>
      </div>
      {err ? <p className="err small">{err}</p> : null}
      <div className="adm-actions">
        <button className="adm-btn primary" disabled={!!busy || (!f.web && !f.app)}>{busy || "Publish ad"}</button>
      </div>
    </form>
  );
}

export default function AdminAds() {
  const [ads, setAds] = useState<Ad[] | null>(null);
  const [pending, setPending] = useState<Ad[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [all, wait] = await Promise.all([
        api<{ ads: Ad[] }>("/ads/admin/all"),
        api<{ ads: Ad[] }>("/ads/admin/pending"),
      ]);
      setAds(all.ads.filter((a) => a.status !== "pending_review"));
      setPending(wait.ads);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try { await fn(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function decide(ad: Ad, action: "approve" | "reject") {
    if (action === "reject" && !(await askConfirm({ title: "Reject this ad?", message: "The advertiser's coins are refunded.", confirmLabel: "Reject", tone: "danger", icon: "warning" }))) return;
    run(ad.id, () => api(`/ads/admin/${ad.id}/${action}`, { method: "PATCH" }));
  }

  async function remove(ad: Ad) {
    if (!(await askConfirm({ title: "Delete this ad?", message: "It leaves the feed and its numbers are gone.", confirmLabel: "Delete", tone: "danger", icon: "delete" }))) return;
    run(ad.id, () => api(`/ads/admin/${ad.id}`, { method: "DELETE" }));
  }

  return (
    <>
      <h2>Ads</h2>
      <p className="muted small">Ads scroll in the feed like drops, about one every 9. Each person sees the same ad at most 3 times a day. Premium members never see ads.</p>
      {error ? <p className="err">{error}</p> : null}
      <NewAd onDone={load} />

      {!ads ? <p className="muted">Loading…</p> : ads.length === 0 ? <p className="muted">No ads yet.</p> : (
        <div className="adm-list">
          {ads.map((ad) => (
            <div key={ad.id} className="adm-card">
              <Media ad={ad} />
              <b style={{ whiteSpace: "pre-line" }}>{ad.title}</b>
              <a href={ad.link_url} target="_blank" rel="noopener noreferrer nofollow" className="adm-clip small">{ad.link_url}</a>
              <div className="adm-chips">
                <Badge tone={ad.ended ? "bad" : ad.active ? "ok" : "warn"}>{ad.ended ? "Ended" : ad.active ? "Running" : "Paused"}</Badge>
                {ad.adult ? <Badge tone="warn">18+</Badge> : null}
                {(ad.platforms?.length ? ad.platforms : ["web", "app"]).map((p) => <Badge key={p}>{p === "web" ? "Website" : "App"}</Badge>)}
                {ad.countries?.length ? <Badge>{ad.countries.join(", ")}</Badge> : null}
                {ad.ad_type === "sponsored" ? <Badge>Member ad</Badge> : null}
              </div>
              <div className="adm-stats">
                <span><b>{ad.views ?? 0}</b> views</span>
                <span className="adm-eng"><b>{ad.taps ?? 0}</b> taps</span>
                <span><b>{ad.tap_rate ?? 0}%</b> tap rate</span>
                <span><b>{ad.likes ?? 0}</b> likes</span>
                <span><b>{ad.hides ?? 0}</b> hid it</span>
              </div>
              <div className="adm-foot">
                <span className="muted small">{ad.expires_at ? `Ends ${fmtDate(ad.expires_at)}` : "No end date"}</span>
                <div className="adm-actions">
                  <button className="adm-btn danger" disabled={busy === ad.id} onClick={() => remove(ad)}>Delete</button>
                  <button className="adm-btn" disabled={busy === ad.id} onClick={() => run(ad.id, () => api(`/ads/admin/${ad.id}`, { method: "PATCH", body: { active: !ad.active } }))}>
                    {ad.active ? "Pause" : "Run"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pending.length ? (
        <>
          <h3>Waiting for review</h3>
          <p className="muted small">Member ads. Rejecting refunds their coins.</p>
          <div className="adm-list">
            {pending.map((ad) => (
              <div key={ad.id} className="adm-card">
                <Media ad={ad} />
                <b>{ad.title}</b>
                <a href={ad.link_url} target="_blank" rel="noopener noreferrer nofollow" className="adm-clip small">{ad.link_url}</a>
                <div className="adm-foot">
                  <span className="muted small">Submitted {fmtDate(ad.created_at)}</span>
                  <div className="adm-actions">
                    <button className="adm-btn danger" disabled={busy === ad.id} onClick={() => decide(ad, "reject")}>Reject</button>
                    <button className="adm-btn primary" disabled={busy === ad.id} onClick={() => decide(ad, "approve")}>Approve</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
