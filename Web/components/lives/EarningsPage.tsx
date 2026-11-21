"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Clock } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { livesApi, money, type Earnings } from "@/lib/lives";
import PayoutForm from "./PayoutForm";
import "@/app/lives.css";

const STATUS: Record<Earnings["weeks"][number]["status"], string> = { in_progress: "This week", due: "Paying soon", paid: "Paid" };

function weekLabel(iso: string) {
  const start = new Date(iso);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const fmt = (d: Date) => d.toLocaleDateString([], { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function EarningsPage() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [data, setData] = useState<Earnings | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (ready && !user) { router.replace("/login?next=/lives/earnings"); return; }
    if (user) livesApi.earnings().then(setData).catch((e) => setError((e as Error).message));
  }, [ready, user, router]);

  return (
    <AppShell title="Earnings" back="/lives">
      <div className="lv-page lv-narrow">
        {error ? <p className="err">{error}</p> : null}
        {!data && !error ? <p className="muted">Loading…</p> : null}
        {data ? (
          <>
            <section className="lv-owed">
              <small>Waiting to be paid</small>
              <b>{money(data.owed_amount, data.currency)}</b>
              <span className="muted small">
                {data.owed_coins} coins · paid every week. You keep {Math.round(data.host_share * 100)}% of entry fees and all gifts.
              </span>
            </section>

            <section className="lv-section">
              <h3>Payout details</h3>
              {data.profile && !editing ? (
                <div className="lv-profile">
                  <div>
                    <b>{data.profile.legal_name}</b>
                    <small className="muted">{data.profile.destination} · ID ending {data.profile.id_number_last4}</small>
                  </div>
                  <span className={`lv-verify${data.profile.verified ? " ok" : ""}`}>
                    {data.profile.verified ? <><BadgeCheck aria-hidden />Verified</> : <><Clock aria-hidden />Checking</>}
                  </span>
                  <button className="pill ghost" onClick={() => setEditing(true)}>Edit</button>
                </div>
              ) : (
                <PayoutForm initial={data.profile} onSaved={() => { setEditing(false); livesApi.earnings().then(setData).catch(() => {}); }} />
              )}
            </section>

            <section className="lv-section">
              <h3>By week</h3>
              {data.weeks.length ? (
                <ul className="lv-weeks">
                  {data.weeks.map((w) => (
                    <li key={w.week}>
                      <span>{weekLabel(w.week)}</span>
                      <b>{money(w.amount, data.currency)}</b>
                      <em className={w.status}>{STATUS[w.status]}</em>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">No earnings yet. Go live to start earning.</p>}
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
