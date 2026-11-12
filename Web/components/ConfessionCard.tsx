"use client";
/** The body of a text-only confession in the feed: category label, headline (the opening
 * line), the confession and compact facts. Link Up adds the Knock (coins only on Let In);
 * comments stay on the slide's rail. "Read the rest"
 * expands the text in place (it scrolls inside the card) and "Show less" folds it back. The slide around
 * it (rail, gestures, menus) stays in Slide.tsx. Same design as the app's ConfessionCard.jsx. */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Post } from "@/lib/api";
import { CATEGORIES, categoryOf, linkUpFacts, splitConfession, topicLabel, type Category, type Fact } from "@/lib/confession";
import { Feather, Flame, Sparkles } from "lucide-react";

function CategoryIcon({ c }: { c: Category }) {
  const p = { strokeWidth: 2, "aria-hidden": true } as const;
  if (c === "linkup") return <Flame {...p} />;
  if (c === "vulnerable") return <Feather {...p} />;
  return <Sparkles {...p} />;
}

export function CategoryLabel({ c }: { c: Category }) {
  return <span className="cc-label"><CategoryIcon c={c} />{CATEGORIES[c].label}</span>;
}

function Coin() {
  return <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="9" fill="currentColor" /><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" fill="none" stroke="#7a4a00" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

/** Knock CTA: says what a knock is and what it costs before anyone taps. cost 0 = free (Premium). */
export function KnockCta({ name, cost, onClick }: { name: string | null; cost: number; onClick: () => void }) {
  return (
    <button type="button" className="cc-knock" onClick={onClick}>
      <span className="cc-knock-text">
        <b>Knock{name ? <> on <em>{name}</em>&apos;s door</> : null}</b>
        <small>{cost ? `Free to knock · ${cost} coins only if they let you in` : "Free for you · they decide who comes in"}</small>
      </span>
      <span className="cc-knock-cost" aria-label={cost ? `${cost} coins if they let you in` : "Free"}><Coin />{cost || "Free"}</span>
    </button>
  );
}

function Chips({ facts, extra }: { facts: Fact[]; extra?: React.ReactNode }) {
  if (!facts.length && !extra) return null;
  return (
    <div className="cc-chips">
      {facts.map((f) => <span key={f.text} className={f.hot ? "hot" : undefined}>{f.text}</span>)}
      {extra}
    </div>
  );
}

type Props = {
  post: Post;
  knockCost: number;
  headline?: boolean;          // the drop page's main post: headline is the page's h1
  fontStyle?: React.CSSProperties;
  onKnock: () => void;
  extend?: React.ReactNode;    // the owner's "+12h" button
};

function ConfessionCard({ post, knockCost, headline, fontStyle, onKnock, extend }: Props) {
  const cat = categoryOf(post);
  const meta = CATEGORIES[cat];
  const { head, body } = useMemo(() => splitConfession(post.content), [post.content]);
  const facts = useMemo(
    () => (cat === "linkup" ? linkUpFacts(post.hookup, post.live_until) : (post.topics || []).slice(0, 3).map((t) => ({ text: topicLabel(t) }))),
    [cat, post.hookup, post.live_until, post.topics],
  );
  // "Read the rest" shows only when the clamp actually cut something.
  const copyRef = useRef<HTMLDivElement>(null);
  const [cut, setCut] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [post.id]);
  useLayoutEffect(() => {
    const el = copyRef.current;
    if (!el || open) return;
    const check = () => setCut([...el.querySelectorAll<HTMLElement>(".cc-head, .cc-body")].some((n) => n.scrollHeight > n.clientHeight + 2));
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [head, body, open]);
  function toggle() {
    if (open && copyRef.current) copyRef.current.scrollTop = 0;
    setOpen((o) => !o);
  }
  const canKnock = cat === "linkup" && !post.is_own_post && !post.is_admin_drop;
  const Head = headline ? "h1" : "p";

  return (
    <div className={`cc cc-${cat}`} style={{ "--cc-tint": meta.tint } as React.CSSProperties}>
      <CategoryLabel c={cat} />
      <div className={`cc-copy${open ? " open" : ""}`} ref={copyRef} id={`cc-${post.id}`}>
        {head ? <Head className={`cc-head${body ? "" : " solo"}`} style={fontStyle}>{head}</Head> : null}
        {body ? (headline && !head ? <h1 className="cc-body lead">{body}</h1> : <p className={`cc-body${head ? "" : " lead"}`}>{body}</p>) : null}
      </div>
      {cut || open ? (
        <button type="button" className="cc-more" onClick={toggle} aria-expanded={open} aria-controls={`cc-${post.id}`}>
          {open ? "Show less" : "Read the rest"}
        </button>
      ) : null}
      <Chips
        facts={facts}
        extra={<>{extend}{cat === "linkup" && post.linkup_count ? <span>{post.linkup_count} linked up</span> : null}</>}
      />
      {canKnock ? <KnockCta name={post.anonymous_name} cost={knockCost} onClick={onKnock} /> : null}
    </div>
  );
}

export default memo(ConfessionCard);

/** The same card in flow and scaled down: the composers' live preview of how it reads in the feed. */
export function ConfessionPreview({ category, text, facts = [], name, placeholder, right }: {
  category: Category; text: string; facts?: Fact[]; name?: string | null; placeholder?: string; right?: React.ReactNode;
}) {
  const { head, body } = splitConfession(text);
  return (
    <div className={`cc cc-preview cc-${category}`} style={{ "--cc-tint": CATEGORIES[category].tint } as React.CSSProperties} aria-live="polite">
      <div className="cc-preview-top"><CategoryLabel c={category} />{right}</div>
      <div className="cc-copy">
        {head ? <p className={`cc-head${body ? "" : " solo"}`}>{head}</p> : null}
        {body ? <p className={`cc-body${head ? "" : " lead"}`}>{body}</p> : null}
        {!head && !body ? <p className="cc-body cc-empty">{placeholder || "Your confession shows here as you write."}</p> : null}
      </div>
      <Chips facts={facts} />
      {name ? <span className="cc-by">{name} · just now</span> : null}
    </div>
  );
}
