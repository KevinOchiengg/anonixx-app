"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import Sheet from "./Sheet";

const REASONS: [string, string][] = [
  ["abuse", "Harassment or hate"],
  ["doxxing", "Exposes someone's identity"],
  ["self-harm-concern", "Someone may be in danger"],
  ["spam", "Spam or scam"],
  ["explicit", "Explicit or illegal content"],
  ["other", "Something else"],
];

export default function ReportSheet({
  postId,
  onClose,
  onDone,
}: {
  postId: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(reason: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/drops/${postId}/report`, { body: { reason } });
      onDone("Thanks. We'll review it.");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Sheet title="Report this post" onClose={onClose}>
      <div className="list">
        {REASONS.map(([k, label]) => (
          <button key={k} className="opt-row" disabled={busy} onClick={() => send(k)}>{label}</button>
        ))}
      </div>
      {error ? <div className="err">{error}</div> : null}
    </Sheet>
  );
}
