"use client";
import { COUNTRIES } from "@/lib/locations";

/** Country picker for targeting a drop. "" means no country (shown everywhere). */
export default function CountryField({ value, onChange, label = "Country" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const list = value && !COUNTRIES.includes(value) ? [value, ...COUNTRIES] : COUNTRIES;
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Everywhere</option>
        {list.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
}
