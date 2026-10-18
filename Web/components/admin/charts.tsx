"use client";
import { useId, useRef, useState } from "react";

export type Series = { name: string; color: string; values: number[] };

const nice = (n: number) => {
  if (n <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.ceil(n / p) * p;
};

export function LineChart({ labels, series, height = 240 }: { labels: string[]; series: Series[]; height?: number }) {
  const uid = useId().replace(/:/g, "");
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, L = 34, R = 10, T = 12, B = 24;
  const max = nice(Math.max(1, ...series.flatMap((s) => s.values)));
  const n = Math.max(1, labels.length - 1);
  const x = (i: number) => L + (i / n) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const grid = [0, 0.25, 0.5, 0.75, 1];
  const ticks = labels.map((l, i) => ({ l, i })).filter(({ i }) => i % Math.ceil(labels.length / 6) === 0);

  const move = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.min(labels.length - 1, Math.max(0, Math.round(((px - L) / (W - L - R)) * n))));
  };

  return (
    <div className="adm-chart" ref={box} onPointerMove={move} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Activity over time">
        <defs>
          {series.map((s, k) => (
            <linearGradient key={k} id={`${uid}g${k}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {grid.map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(max * g)} y2={y(max * g)} className="gl" />
            <text x={L - 6} y={y(max * g) + 4} textAnchor="end" className="gt">{Math.round(max * g)}</text>
          </g>
        ))}
        {ticks.map(({ l, i }) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="gt">{l.slice(5)}</text>
        ))}
        {series.map((s, k) => {
          const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
          return (
            <g key={s.name}>
              {k === 0 ? <polygon points={`${x(0)},${y(0)} ${pts.join(" ")} ${x(s.values.length - 1)},${y(0)}`} fill={`url(#${uid}g${k})`} /> : null}
              <polyline points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {hover !== null ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="gl on" />
            {series.map((s) => <circle key={s.name} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r="4" fill={s.color} stroke="var(--card)" strokeWidth="2" />)}
          </g>
        ) : null}
      </svg>
      {hover !== null ? (
        <div className="adm-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{labels[hover]}</b>
          {series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name} <em>{s.values[hover] ?? 0}</em></span>)}
        </div>
      ) : null}
    </div>
  );
}

export function Donut({ parts, total, label }: { parts: { name: string; value: number; color: string }[]; total: number; label: string }) {
  const R = 52, C = 2 * Math.PI * R;
  const sum = parts.reduce((a, p) => a + p.value, 0) || 1;
  let acc = 0;
  return (
    <div className="adm-donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={label}>
        <circle cx="70" cy="70" r={R} className="track" />
        {parts.map((p) => {
          const len = (p.value / sum) * C;
          const el = <circle key={p.name} cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 3)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" strokeLinecap="round" />;
          acc += len;
          return el;
        })}
        <text x="70" y="68" textAnchor="middle" className="dn">{total}</text>
        <text x="70" y="86" textAnchor="middle" className="dl">{label}</text>
      </svg>
      <ul>
        {parts.map((p) => (
          <li key={p.name}><i style={{ background: p.color }} />{p.name}<b>{p.value}</b></li>
        ))}
      </ul>
    </div>
  );
}

export function Spark({ values, color }: { values: number[]; color: string }) {
  const W = 120, H = 36, max = Math.max(1, ...values), n = Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${((i / n) * W).toFixed(1)},${(H - 3 - (v / max) * (H - 8)).toFixed(1)}`).join(" ");
  return (
    <svg className="adm-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
