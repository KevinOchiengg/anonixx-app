"use client";
import { useEffect, useRef } from "react";

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

type GsiId = {
  initialize: (cfg: { client_id: string; callback: (r: { credential?: string }) => void; auto_select?: boolean }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
};
declare global {
  interface Window { google?: { accounts: { id: GsiId } } }
}

let loader: Promise<void> | null = null;
let handler: (token: string) => void = () => {};

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { loader = null; reject(new Error("Google didn't load")); };
      document.head.appendChild(s);
    });
  }
  return loader;
}

export default function GoogleButton({
  onToken, text = "continue_with",
}: {
  onToken: (idToken: string) => void;
  text?: "signin_with" | "signup_with" | "continue_with";
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { handler = onToken; }, [onToken]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let live = true;
    loadGsi().then(() => {
      const gid = window.google?.accounts?.id;
      if (!live || !gid || !box.current) return;
      gid.initialize({
        client_id: GOOGLE_CLIENT_ID,
        auto_select: false,
        callback: (r) => { if (r.credential) handler(r.credential); },
      });
      gid.renderButton(box.current, {
        type: "standard", theme: "filled_black", size: "large", shape: "pill",
        text, logo_alignment: "left", width: Math.min(box.current.clientWidth || 340, 400),
      });
    }).catch(() => {});
    return () => { live = false; };
  }, [text]);

  if (!GOOGLE_CLIENT_ID) return null;
  return <div ref={box} className="g-btn" />;
}
