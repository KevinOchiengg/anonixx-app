"use client";
import { useEffect, useRef } from "react";
import "@/app/confirm.css";

export type ConfirmOptions = {
  title: string;
  message?: React.ReactNode;
  detail?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

type Props = ConfirmOptions & { onConfirm: () => void; onCancel: () => void };

export default function ConfirmDialog({
  title, message, detail, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "default", onConfirm, onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="cf-back" onClick={onCancel}>
      <div
        className="cf-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cf-title"
        aria-describedby={message ? "cf-msg" : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="cf-title">{title}</h3>
        {message ? <p id="cf-msg" className="cf-msg">{message}</p> : null}
        {detail ? <div className="cf-detail">{detail}</div> : null}
        <div className="cf-actions">
          <button type="button" className="cf-btn" onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            ref={confirmRef}
            className={`cf-btn primary${tone === "danger" ? " danger" : ""}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
