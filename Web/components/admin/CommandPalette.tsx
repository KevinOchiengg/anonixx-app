"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

// Ctrl/Cmd+K: jump to any admin page, user or post search from one box.
type Hit = { label: string; hint: string; href: string };
type U = { id: string; email: string | null; username: string | null; anonymous_name: string | null };

export default function CommandPalette({ pages, open, onClose }: { pages: { href: string; label: string }[]; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<U[]>([]);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const term = q.trim();

  useEffect(() => { if (open) { setQ(""); setUsers([]); setSel(0); window.setTimeout(() => input.current?.focus(), 0); } }, [open]);

  useEffect(() => {
    if (term.length < 2) { setUsers([]); return; }
    let live = true;
    const t = window.setTimeout(() => {
      api<{ users: U[] }>(`/admin/users?search=${encodeURIComponent(term)}&skip=0&limit=5`)
        .then((r) => { if (live) setUsers(r.users); }).catch(() => {});
    }, 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [term]);

  if (!open) return null;

  const low = term.toLowerCase();
  const hits: Hit[] = [
    ...pages.filter((p) => !low || p.label.toLowerCase().includes(low)).map((p) => ({ label: p.label, hint: "Page", href: p.href })),
    ...users.map((u) => ({ label: u.anonymous_name || u.username || u.email || "User", hint: u.email || "User", href: `/admin/users/${u.id}` })),
    ...(term ? [
      { label: `Posts matching “${term}”`, hint: "Search", href: `/admin/posts?q=${encodeURIComponent(term)}` },
      { label: `Users matching “${term}”`, hint: "Search", href: `/admin/users?q=${encodeURIComponent(term)}` },
    ] : []),
  ];
  const at = Math.min(sel, Math.max(0, hits.length - 1));
  const go = (h?: Hit) => { if (!h) return; onClose(); router.push(h.href); };

  return (
    <div className="adm-cmd" onClick={onClose}>
      <div className="adm-cmd-box" role="dialog" aria-label="Search admin" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={q}
          placeholder="Search pages, users, posts…"
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") { e.preventDefault(); setSel(Math.min(at + 1, hits.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel(Math.max(at - 1, 0)); }
            else if (e.key === "Enter") go(hits[at]);
          }}
        />
        <ul>
          {hits.length === 0 ? <li className="muted small">Nothing matches.</li> : hits.map((h, i) => (
            <li key={h.href + i}>
              <button type="button" className={i === at ? "on" : ""} onMouseEnter={() => setSel(i)} onClick={() => go(h)}>
                <span>{h.label}</span><em>{h.hint}</em>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
