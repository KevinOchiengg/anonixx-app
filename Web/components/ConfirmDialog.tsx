"use client";
import { useEffect, useRef } from "react";
import {
  Ban, BellOff, Coins, DoorOpen, Flag, Info, LogOut, Radio, Rocket, Trash2, TriangleAlert, type LucideIcon,
} from "lucide-react";
import "@/app/confirm.css";

export type AlertIcon =
  | "delete" | "block" | "report" | "coins" | "boost" | "live" | "leave" | "logout" | "mute" | "warning" | "info";

export type ConfirmOptions = {
  title: string;
  message?: React.ReactNode;
  detail?: React.ReactNode;
  confirmLabel?: string;
  /** null hides the cancel button (a notice). */
  cancelLabel?: string | null;
  tone?: "default" | "danger";
  icon?: AlertIcon;
};

const ICONS: Record<AlertIcon, LucideIcon> = {
  delete: Trash2,
  block: Ban,
  report: Flag,
  coins: Coins,
  boost: Rocket,
  live: Radio,
  leave: DoorOpen,
  logout: LogOut,
  mute: BellOff,
  warning: TriangleAlert,
  info: Info,
};

type Props = ConfirmOptions & { onConfirm: () => void; onCancel: () => void };

export default function ConfirmDialog({
  title, message, detail, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "default", icon,
  onConfirm, onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const danger = tone === "danger";
  const Icon = ICONS[icon || (danger ? "warning" : "info")];

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="cf-back" onClick={onCancel}>
      <div
        className={`cf-card${danger ? " danger" : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cf-title"
        aria-describedby={message ? "cf-msg" : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="cf-grip" aria-hidden />
        <span className="cf-orb" aria-hidden><Icon strokeWidth={2} /></span>
        <h3 id="cf-title">{title}</h3>
        {message ? <p id="cf-msg" className="cf-msg">{message}</p> : null}
        {detail ? <div className="cf-detail">{detail}</div> : null}
        <div className="cf-actions">
          <button
            type="button"
            ref={confirmRef}
            className={`cf-btn primary${danger ? " danger" : ""}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          {cancelLabel !== null ? (
            <button type="button" className="cf-btn ghost" onClick={onCancel}>{cancelLabel}</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
