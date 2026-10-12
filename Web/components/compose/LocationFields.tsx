"use client";
import { COUNTRIES, KENYA_COUNTIES } from "@/lib/locations";

export type LocationDraft = { country: string; county: string; subCounty: string; estate: string };

export default function LocationFields({ value, onChange }: { value: LocationDraft; onChange: (v: LocationDraft) => void }) {
  const kenya = value.country === "Kenya";
  return (
    <div className="cx-card">
      <label className="field">
        Country
        <select value={value.country} onChange={(e) => onChange({ ...value, country: e.target.value, county: "" })}>
          <option value="">Not set</option>
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      {value.country ? (
        <label className="field">
          {kenya ? "County" : "State / region"}
          {kenya ? (
            <select value={value.county} onChange={(e) => onChange({ ...value, county: e.target.value })}>
              <option value="">Not set</option>
              {KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <input type="text" maxLength={60} value={value.county} onChange={(e) => onChange({ ...value, county: e.target.value })} />
          )}
        </label>
      ) : null}
      <label className="field">
        Sub-county
        <input type="text" maxLength={60} value={value.subCounty} onChange={(e) => onChange({ ...value, subCounty: e.target.value })} placeholder="e.g. Westlands" />
      </label>
      <label className="field">
        Estate / neighbourhood
        <input type="text" maxLength={60} value={value.estate} onChange={(e) => onChange({ ...value, estate: e.target.value })} placeholder="e.g. Kilimani" />
      </label>
    </div>
  );
}
