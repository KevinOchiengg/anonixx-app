"use client";
import { useState } from "react";
import { api, type Post } from "@/lib/api";
import Sheet from "./Sheet";
import { Flag, UserX } from "./feedicons";

const REASONS: [string, string][] = [
  ["abuse", "Harassment or abuse"],
  ["explicit", "Sexually explicit or unwanted"],
  ["doxxing", "Shares private info"],
  ["self-harm-concern", "Self-harm concern"],
  ["spam", "Spam or scam"],
  ["other", "Something else"],
];

export default function ReportSheet({
  post,
  onClose,
  onDone,
  onBlocked,
}: {
  post: Post;
  onClose: () => void;
  onDone: (msg: string) => void;
  onBlocked?: (post: Post) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(reason: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/drops/${post.id}/report`, { body: { reason } });
      onDone("Report received. Thank you.");
    } catch {
      setError("Could not send the report. Try again.");
      setBusy(false);
    }
  }

  async function block() {
    if (busy || !post.user_id) return;
    if (!window.confirm("Block this person?\n\nYou won't see each other's posts or messages.")) return;
    setBusy(true);
    setError("");
    try {
      await api(`/users/${post.user_id}/block`, { method: "POST" });
      onBlocked?.(post);
      onDone("Blocked.");
    } catch {
      setError("Could not block. Try again.");
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose}>
      <div className="rs-head"><Flag /><h3>Report this post</h3></div>
      <div className="list">
        {REASONS.map(([k, label]) => (
          <button key={k} className="opt-row" disabled={busy} onClick={() => send(k)}>{label}</button>
        ))}
        {post.user_id ? (
          <button className="opt-row rs-block" disabled={busy} onClick={block}><UserX />Block this person</button>
        ) : null}
      </div>
      {error ? <div className="err">{error}</div> : null}
    </Sheet>
  );
}
