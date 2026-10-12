"use client";

export type PollDraft = { question: string; options: string[] };

export default function PollEditor({ value, onChange }: { value: PollDraft; onChange: (v: PollDraft) => void }) {
  const setOpt = (i: number, t: string) => onChange({ ...value, options: value.options.map((o, j) => (j === i ? t : o)) });
  return (
    <div className="cx-card">
      <label className="field">
        Ask a question
        <input type="text" maxLength={140} value={value.question} onChange={(e) => onChange({ ...value, question: e.target.value })} placeholder="What do you want to know?" />
      </label>
      {value.options.map((o, i) => (
        <div className="cx-opt" key={i}>
          <input type="text" maxLength={60} value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} />
          {value.options.length > 2 ? (
            <button type="button" className="cx-x" aria-label="Remove option" onClick={() => onChange({ ...value, options: value.options.filter((_, j) => j !== i) })}>×</button>
          ) : null}
        </div>
      ))}
      {value.options.length < 4 ? (
        <button type="button" className="linkish" onClick={() => onChange({ ...value, options: [...value.options, ""] })}>+ Add option</button>
      ) : null}
    </div>
  );
}
