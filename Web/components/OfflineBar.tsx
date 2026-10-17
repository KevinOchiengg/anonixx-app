"use client";
import { useEffect, useState } from "react";

type State = "online" | "offline" | "back";

export default function OfflineBar() {
  const [state, setState] = useState<State>("online");

  useEffect(() => {
    let timer: number | undefined;
    const off = () => { window.clearTimeout(timer); setState("offline"); };
    const on = () => {
      setState((s) => (s === "offline" ? "back" : s));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setState("online"), 2200);
    };
    if (!navigator.onLine) off();
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
      window.clearTimeout(timer);
    };
  }, []);

  if (state === "online") return null;
  return (
    <div className={`net-bar ${state}`} role="status" aria-live="polite">
      {state === "offline" ? "No connection. Showing what's already loaded." : "Back online."}
    </div>
  );
}
