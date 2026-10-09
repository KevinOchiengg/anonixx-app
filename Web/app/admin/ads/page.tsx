"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, fmtDate } from "@/components/admin/bits";

type Ad = {
  id: string; title: string; media_url: string | null; media_type: string; link_url: string;
  ad_type: string; status: string; expires_at: string | null; created_at: string;
};

export default function AdminAds() {
  const [ads, setAds] = useState<Ad[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setAds((await api<{ ads: Ad[] }>("/ads/admin/pending")).ads);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(ad: Ad, action: "approve" | "reject") {
    if (action === "reject" && !window.confirm("Reject this ad? The advertiser's coins are refunded.")) return;
    setBusy(ad.id);
    try { await api(`/ads/admin/${ad.id}/${action}`, { method: "PATCH" }); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <>
      <h2>Feed ads</h2>
      <p className="muted small">Submissions waiting for review. Rejecting refunds the advertiser.</p>
      {error ? <p className="err">{error}</p> : null}
      {!ads ? <p className="muted">Loading…</p> : ads.length === 0 ? <p className="muted">No ads waiting.</p> : (
        <div className="adm-list">
          {ads.map((ad) => (
            <div key={ad.id} className="adm-card">
              {ad.media_url && (ad.media_type === "image" || ad.media_type === "gif" || !ad.media_type) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ad.media_url} alt="" className="adm-cover" />
              ) : ad.media_url ? (
                <a href={ad.media_url} target="_blank" rel="noopener noreferrer" className="adm-clip">{(ad.media_type || "media").toUpperCase()} attached — open</a>
              ) : null}
              <b>{ad.title}</b>
              <a href={ad.link_url} target="_blank" rel="noopener noreferrer nofollow" className="adm-clip small">{ad.link_url}</a>
              <div className="adm-chips"><Badge>{ad.ad_type}</Badge></div>
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
      )}
    </>
  );
}
