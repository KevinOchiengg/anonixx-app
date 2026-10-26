"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LineChart } from "@/components/admin/charts";

type Money = {
  days: number;
  revenue: { usd: number; kes: number; count: number };
  payers_period: number; payers_all_time: number; new_payers: number;
  conversion_all_pct: number; new_user_conversion_pct: number;
  arppu_usd: number; arppu_kes: number;
  coins: { issued: number; spent: number; circulating: number };
  refunds: { by_status: Record<string, number>; accepted: number; rate_pct: number };
  by_provider: Record<string, number>;
  series: { labels: string[]; usd: number[]; kes: number[] };
};

const RANGES = [7, 30, 90, 365] as const;

export default function MoneyPage() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [d, setD] = useState<Money | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setD(null);
    api<Money>(`/admin/insights/money?days=${days}`).then(setD).catch((e) => setErr((e as Error).message));
  }, [days]);

  const rev = d ? [d.revenue.usd ? `$${d.revenue.usd.toFixed(2)}` : "", d.revenue.kes ? `KES ${d.revenue.kes.toLocaleString()}` : ""].filter(Boolean).join(" + ") || "0" : "—";
  const kpis = d ? [
    { label: "Revenue", value: rev, sub: `${d.revenue.count} purchases`, color: "#FF634A" },
    { label: "Paying users", value: d.payers_period, sub: `${d.new_payers} first-time · ${d.payers_all_time} all time`, color: "#3B82F6" },
    { label: "Users who pay", value: `${d.conversion_all_pct}%`, sub: `${d.new_user_conversion_pct}% of new users this period`, color: "#34d399" },
    { label: "Per paying user", value: d.arppu_usd ? `$${d.arppu_usd.toFixed(2)}` : d.arppu_kes ? `KES ${d.arppu_kes}` : "—", sub: d.arppu_usd && d.arppu_kes ? `+ KES ${d.arppu_kes}` : "average spend", color: "#F59E0B" },
  ] : [];

  return (
    <>
      <div className="adm-pagehead">
        <div><h2>Money</h2><p>Who pays, how much, and whether the coin economy is healthy.</p></div>
        <div className="adm-seg-sm">{RANGES.map((r) => <button key={r} type="button" className={days === r ? "on" : ""} onClick={() => setDays(r)}>{r}d</button>)}</div>
      </div>
      {err ? <p className="err">{err}</p> : null}
      {!d ? <p className="muted small">Loading…</p> : (
        <div className="adm-dash">
          <div className="w8" style={{ gridColumn: "span 12" }}>
            <div className="adm-kpis">
              {kpis.map((k) => (
                <div key={k.label} className="adm-kpi" style={{ "--k": k.color } as React.CSSProperties}>
                  <span className="v">{k.value}</span><span className="l">{k.label}</span><span className="s">{k.sub}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="adm-panel w8">
            <h3>Revenue by day</h3>
            <LineChart labels={d.series.labels} series={[
              { name: "USD", color: "#FF634A", values: d.series.usd },
              { name: "KES ÷ 100", color: "#34d399", values: d.series.kes.map((k) => Math.round(k / 100)) },
            ]} />
            <div className="adm-legend"><span><i style={{ background: "#FF634A" }} />USD</span><span><i style={{ background: "#34d399" }} />KES (÷100 to share the scale)</span></div>
          </div>
          <div className="adm-panel w4">
            <h3>Coin economy</h3>
            <dl className="adm-kv">
              <dt>Coins given out</dt><dd>{d.coins.issued.toLocaleString()}</dd>
              <dt>Coins spent</dt><dd>{d.coins.spent.toLocaleString()}</dd>
              <dt>In wallets now</dt><dd>{d.coins.circulating.toLocaleString()}</dd>
            </dl>
            <p className="muted small">
              {d.coins.issued > d.coins.spent * 2 && d.coins.issued > 500
                ? "Far more coins are going out than being spent: rewards may be too generous, or there's too little worth spending on."
                : d.coins.spent > d.coins.issued && d.coins.spent > 0
                ? "People spend more than they're given: good demand for coins."
                : "Coins in and out are roughly balanced."}
            </p>
          </div>
          <div className="adm-panel w6">
            <h3>Refunds</h3>
            <dl className="adm-kv">
              {Object.entries(d.refunds.by_status).flatMap(([k, v]) => [<dt key={`${k}-t`}>{k}</dt>, <dd key={`${k}-d`}>{v}</dd>])}
              <dt>Refund rate</dt><dd><b style={{ color: d.refunds.rate_pct > 5 ? "#ff5d6c" : undefined }}>{d.refunds.rate_pct}%</b> of purchases</dd>
            </dl>
            {Object.keys(d.refunds.by_status).length === 0 ? <p className="adm-empty">No refund requests in this period.</p> : null}
          </div>
          <div className="adm-panel w6">
            <h3>How people pay</h3>
            {Object.keys(d.by_provider).length === 0 ? <p className="adm-empty">No purchases in this period.</p> : (
              <dl className="adm-kv">{Object.entries(d.by_provider).flatMap(([k, v]) => [<dt key={`${k}-t`}>{k}</dt>, <dd key={`${k}-d`}>{v} purchases</dd>])}</dl>
            )}
          </div>
        </div>
      )}
    </>
  );
}
