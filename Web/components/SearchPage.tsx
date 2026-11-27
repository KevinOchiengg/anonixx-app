"use client";
// One search box over every drop (components/search/AllSearch.tsx, backend search.py).
// Nothing shows until you type. Recent searches stay on this device.
import { useKept } from "@/lib/pageMemory";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { trackSearch } from "@/lib/track";
import BottomNav from "./BottomNav";
import { Clock, Close, SearchIcon } from "./feedicons";
import { BrandMark } from "./AppShell";
import AllSearch from "./search/AllSearch";

const HISTORY_KEY = "@anonixx_search_history";
const MAX_HISTORY = 8;

function readHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") as string[]; } catch { return []; }
}
function writeHistory(list: string[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
}

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useKept("query", "");
  const [likeId, setLikeId] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    setLikeId(new URLSearchParams(window.location.search).get("like"));
    setHistory(readHistory());
  }, []);

  function remember(q = query) {
    const t = q.trim();
    if (t.length < 2) return;
    const next = [t, ...history.filter((h) => h.toLowerCase() !== t.toLowerCase())].slice(0, MAX_HISTORY);
    setHistory(next);
    writeHistory(next);
  }

  function forget(h: string) {
    const next = history.filter((x) => x !== h);
    setHistory(next);
    writeHistory(next);
  }

  const idle = !query.trim() && !likeId;

  return (
    <div className="stage">
      <div className="phone sp-phone dc hasnav">
        <BrandMark />
        <form className="sp-head" onSubmit={(e) => { e.preventDefault(); remember(); (document.activeElement as HTMLElement | null)?.blur(); }}>
          <button type="button" className="sp-back" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} aria-label="Back">
            <ArrowLeft size={20} strokeWidth={2} aria-hidden />
          </button>
          <div className="sp-input">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search videos, confessions, people…"
              aria-label="Search"
              enterKeyHint="search"
              autoFocus={!likeId}
            />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><Close /></button> : null}
          </div>
        </form>

        <div className="sp-body">
          {idle && history.length ? (
            <div className="dc-hist">
              <div className="sp-section"><span>Recent</span><button type="button" onClick={() => { setHistory([]); writeHistory([]); }}>Clear</button></div>
              {history.map((h) => (
                <div key={h} className="sp-hist" onClick={() => setQuery(h)}>
                  <Clock /><span>{h}</span>
                  <button type="button" aria-label={`Remove ${h}`} onClick={(e) => { e.stopPropagation(); forget(h); }}><Close /></button>
                </div>
              ))}
            </div>
          ) : null}
          <AllSearch
            query={query}
            likeId={likeId}
            onPick={(q) => { setQuery(q); remember(q); }}
            onTrack={(n) => trackSearch(query, { theme: "all", n })}
          />
        </div>
        <BottomNav />
      </div>
    </div>
  );
}
