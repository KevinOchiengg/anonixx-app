"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { allowMature } from "@/lib/matureConsent";

const KEY = "anonixx.adult.ok";
const AFTER = 3;

function accepted(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

/** First visit: after a few drops, a full-screen 18+ welcome. Once accepted, never again on this device. */
export default function AdultWelcome({ seen }: { seen: number }) {
  const { user, ready } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready || open || seen < AFTER || user?.age_verified || accepted()) return;
    setOpen(true);
  }, [ready, seen, user?.age_verified, open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  function enter() {
    try { localStorage.setItem(KEY, "1"); } catch { /* storage blocked: shows again next visit */ }
    allowMature();
    if (user && !user.age_verified) api("/users/me/verify-age", { body: { adult_confirmed: true } }).catch(() => {});
    setOpen(false);
  }

  return (
    <div className="aw" role="dialog" aria-modal="true" aria-labelledby="aw-title">
      <div className="aw-box">
        <p className="aw-kicker">Heads up!</p>
        <h2 id="aw-title">Grown-ups only</h2>
        <span className="aw-pill">100% anonymous</span>
        <p className="aw-copy">
          No names, no faces, no small talk. People here say exactly what they want, and{" "}
          <em>nobody knows it&apos;s them</em>.
        </p>
        <button type="button" className="aw-enter" onClick={enter} autoFocus>I&apos;m 18+, let me in</button>
        <p className="aw-fine">
          By entering you confirm you&apos;re 18 or older and agree to the <Link href="/terms">Terms</Link>.{" "}
          <a href="https://www.google.com" rel="noreferrer">Leave</a>
        </p>
      </div>
    </div>
  );
}
