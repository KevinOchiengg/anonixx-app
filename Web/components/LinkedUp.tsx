"use client";
import { useEffect, useState } from "react";
import { Mars, Venus, VenusAndMars } from "lucide-react";

export const LINKED_KEY = "anonixx.linked";

/** Marks a fresh paid Link Up so the chat opens with the coming-together moment. */
export function markLinked(connectionId: string) {
  try { sessionStorage.setItem(LINKED_KEY, connectionId); } catch { /* storage blocked */ }
}

/** ♀ from the left, ♂ from the right, they meet and lock together. Once, on a fresh Link Up. */
export default function LinkedUp({ connectionId, name }: { connectionId: string; name: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(LINKED_KEY) !== connectionId) return;
      sessionStorage.removeItem(LINKED_KEY);
    } catch { return; }
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 2600);
    return () => window.clearTimeout(t);
  }, [connectionId]);

  if (!show) return null;
  return (
    <div className="lku" role="status" onClick={() => setShow(false)}>
      <div className="lku-stage" aria-hidden>
        <span className="lku-l"><Venus strokeWidth={2} /></span>
        <span className="lku-r"><Mars strokeWidth={2} /></span>
        <span className="lku-one"><VenusAndMars strokeWidth={2} /></span>
      </div>
      <b>You&apos;re linked up.</b>
      <p>{name} is waiting. Say something worth answering.</p>
    </div>
  );
}
