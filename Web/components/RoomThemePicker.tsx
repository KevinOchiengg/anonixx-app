"use client";
import { useEffect, useState } from "react";
import { ROOM_THEMES, roomThemeById, roomThemeVars } from "@/lib/roomThemes";

/** A Room in miniature: glow, avatar, name, intro, three frames and the Knock pill. */
export function RoomMini({ theme, name, big = false }: { theme: string; name?: string; big?: boolean }) {
  return (
    <div className={`rmini${big ? " big" : ""}`} style={roomThemeVars(theme)} aria-hidden>
      <span className="rmini-glow" />
      <span className="rmini-ava">{(name || "A")[0].toUpperCase()}</span>
      {big ? <b className="rmini-name">{name || "Your Room"}</b> : <span className="rmini-line w60" />}
      {big ? <i className="rmini-room">{roomThemeById(theme).room}</i> : <span className="rmini-line w40 dim" />}
      <span className="rmini-tiles"><i /><i /><i /></span>
      <span className="rmini-knock">{big ? "Knock" : null}</span>
    </div>
  );
}

/**
 * Pick a Room theme with a live preview. Nothing is saved until Apply;
 * Cancel puts the saved theme back. The saved theme stays marked so it's
 * always clear what visitors see right now.
 */
export default function RoomThemePicker({
  saved, name, onApply,
}: {
  saved: string;
  name?: string;
  onApply: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setDraft(saved); }, [saved]);

  const dirty = draft !== saved;
  const t = roomThemeById(draft);

  async function apply() {
    setBusy(true);
    setError("");
    try {
      await onApply(draft);
    } catch (e) {
      setError((e as Error).message || "Could not save the theme. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rtp">
      <div className="rtp-stage">
        <RoomMini theme={draft} name={name} big />
        <div className="rtp-meta">
          <small>{dirty ? "Previewing" : "Your Room now"}</small>
          <b>{t.name}</b>
          <span>{t.mood}</span>
        </div>
      </div>

      <div className="rtp-grid" role="radiogroup" aria-label="Room theme">
        {ROOM_THEMES.map((th) => (
          <button
            key={th.id}
            type="button"
            role="radio"
            aria-checked={draft === th.id}
            className={`rtp-card${draft === th.id ? " on" : ""}`}
            onClick={() => setDraft(th.id)}
          >
            <RoomMini theme={th.id} />
            <span className="rtp-name">{th.name}{saved === th.id ? <em>current</em> : null}</span>
            <span className="rtp-mood">{th.room}</span>
          </button>
        ))}
      </div>

      {error ? <div className="err">{error}</div> : null}
      <div className={`rtp-bar${dirty ? " show" : ""}`}>
        <button type="button" className="room-cta ghost" disabled={!dirty || busy} onClick={() => setDraft(saved)}>Cancel</button>
        <button type="button" className="room-cta" disabled={!dirty || busy} onClick={apply}>
          {busy ? "Applying…" : `Apply ${t.name}`}
        </button>
      </div>
    </div>
  );
}
