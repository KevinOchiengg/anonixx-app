"use client";
/** Keeps the app sized to the part of the screen the keyboard leaves visible, so text fields
 * (chat, comments, compose) never sit behind it. Android Chrome does this via the viewport's
 * interactive-widget setting; iOS Safari needs the visual viewport tracked here (--app-h). */
import { useEffect } from "react";

export default function KeyboardViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const fit = () => {
      const open = window.innerHeight - vv.height > 120;   // keyboard up
      if (open) {
        root.style.setProperty("--app-h", `${Math.round(vv.height)}px`);
        window.scrollTo(0, 0);   // iOS pans the page up; keep our column in view instead
      } else {
        root.style.removeProperty("--app-h");
      }
    };
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit); root.style.removeProperty("--app-h"); };
  }, []);
  return null;
}
