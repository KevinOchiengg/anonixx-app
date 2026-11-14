"use client";
/** Contact info for a Room chat, over the chat (click the chat header): who they are to you,
 * call buttons, media / voice / links, their Room's welcome media, mute, pin, archive, and the
 * safety actions. */
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { chatsApi, chatTime, mutedLabel, MUTE_OPTIONS, type Prefs, type ThreadItem } from "@/lib/chats";
import type { GalleryItem } from "@/lib/chatTheme";
import { intentLabel } from "@/lib/linkup";
import { Ava, Icon } from "./Messenger";
import { X } from "lucide-react";

export type InfoConn = {
  other_anonymous_name: string; other_user_id?: string; other_is_online: boolean; other_avatar_url?: string | null;
  is_sender?: boolean; inside_since?: string | null; knock_pitch?: string | null; knock_intents?: string[];
  pinned?: boolean; archived?: boolean; muted_until?: string | null;
};
type Kind = "media" | "voice" | "links";

export default function ChatInfo({ id, conn, avatar, gallery, onClose, onPrefs, onCall, onClear, onBlock, onReport, onRemove }: {
  id: string; conn: InfoConn; avatar?: string | null; gallery?: GalleryItem[]; onClose: () => void; onPrefs: (p: Prefs) => void;
  onCall: (video: boolean) => void; onClear: () => void; onBlock: () => void; onReport: () => void; onRemove?: () => void;
}) {
  const [kind, setKind] = useState<Kind>("media");
  const [items, setItems] = useState<Record<string, ThreadItem[]>>({});
  const [counts, setCounts] = useState<{ media: number; voice: number; links: number } | null>(null);
  const [muteOpen, setMuteOpen] = useState(false);
  const [open, setOpen] = useState<{ media_url: string | null; media_type: string | null } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (items[kind]) return;
    chatsApi.media(id, kind).then((r) => { setItems((x) => ({ ...x, [kind]: r.items })); setCounts(r.counts); }).catch(() => setItems((x) => ({ ...x, [kind]: [] })));
  }, [id, kind, items]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  async function pref(body: { pinned?: boolean; archived?: boolean; mute?: string }) {
    setError("");
    try { onPrefs(await chatsApi.prefs(id, body)); } catch (e) { setError((e as Error).message); }
  }

  const name = conn.other_anonymous_name || "Anonymous";
  const since = conn.inside_since ? new Date(conn.inside_since).toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" }) : null;
  const list = items[kind];

  return (
    <div className="ci" role="dialog" aria-modal aria-label={`${name}, contact info`}>
      <div className="ci-top"><button onClick={onClose} aria-label="Close contact info">{Icon.back(20)}</button><b>Contact info</b></div>
      <div className="ci-scroll">
        <div className="ci-hero">
          <Ava name={name} url={conn.other_avatar_url || avatar} seed={conn.other_user_id} size={104} online={conn.other_is_online} />
          <h2>{name}</h2>
          <p>{conn.is_sender ? `Your guest${since ? ` · let in ${since}` : ""}` : `You're inside their Room${since ? ` · since ${since}` : ""}`}</p>
          <small>{conn.other_is_online ? "online" : "offline"}</small>
          <div className="ci-acts">
            <button onClick={() => onCall(false)}>{Icon.phone(20)}<span>Voice</span></button>
            <button onClick={() => onCall(true)}>{Icon.video(21)}<span>Video</span></button>
            {conn.other_user_id ? <Link href={`/room/${conn.other_user_id}`}>{Icon.door(20)}<span>Room</span></Link> : null}
          </div>
        </div>
        {error ? <div className="err pad">{error}</div> : null}

        {conn.knock_pitch || conn.knock_intents?.length ? (
          <div className="ci-card">
            <small className="ci-k">{conn.is_sender ? "THEIR KNOCK" : "YOUR KNOCK"}</small>
            {conn.knock_pitch ? <p className="ci-q">&ldquo;{conn.knock_pitch}&rdquo;</p> : null}
            {conn.knock_intents?.length ? <p className="ci-m">{conn.knock_intents.map((i) => intentLabel(i)).join(" · ")}</p> : null}
          </div>
        ) : null}

        <div className="ci-card">
          <div className="ci-tabs" role="tablist">
            {(["media", "voice", "links"] as Kind[]).map((k) => (
              <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
                {k === "media" ? "Media" : k === "voice" ? "Voice" : "Links"}{counts?.[k] ? ` ${counts[k]}` : ""}
              </button>
            ))}
          </div>
          {!list ? <p className="muted center">Loading…</p> : list.length === 0 ? (
            <p className="ci-m">{kind === "media" ? "Shared photos and videos land here." : kind === "voice" ? "No voice notes yet." : "No links yet."}</p>
          ) : kind === "media" ? (
            <div className="ci-grid">
              {list.map((m) => (
                <button key={m.id} onClick={() => setOpen(m)} aria-label={m.media_type === "video" ? "Open video" : "Open photo"}>
                  {m.media_type === "video" ? <video src={m.media_url || undefined} muted preload="metadata" playsInline /> : <Image src={m.media_url || ""} alt="" width={140} height={140} />}
                  {m.media_type === "video" ? <i>▶</i> : null}
                </button>
              ))}
            </div>
          ) : kind === "voice" ? (
            <ul className="ci-rows">{list.map((m) => <li key={m.id}><small>{m.is_own ? "You" : name} · {chatTime(m.created_at)}</small><audio src={m.media_url || undefined} controls preload="none" /></li>)}</ul>
          ) : (
            <ul className="ci-rows">
              {list.map((m) => (
                <li key={m.id}>
                  <small>{m.is_own ? "You" : name} · {chatTime(m.created_at)}</small>
                  {(m.links || []).map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer nofollow">{u}</a>)}
                </li>
              ))}
            </ul>
          )}
        </div>

        {gallery?.length ? (
          <div className="ci-card">
            <b className="ci-h">Their welcome media</b>
            <div className="ci-grid">
              {gallery.slice(0, 3).map((g, i) => (
                <button key={i} onClick={() => setOpen(g)} aria-label={g.media_type === "video" ? "Open video" : "Open photo"}>
                  {g.media_type === "video" ? <video src={g.media_url} muted preload="metadata" playsInline /> : <Image src={g.media_url} alt="" width={140} height={140} />}
                  {g.media_type === "video" ? <i>▶</i> : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="ci-group">
          <div className="ci-row">
            <span>{Icon.mute(19)}</span><b>Mute notifications</b><em>{mutedLabel(conn.muted_until)}</em>
            {conn.muted_until ? <button className="pill ghost" onClick={() => pref({ mute: "off" })}>Unmute</button> : <button className="pill ghost" onClick={() => setMuteOpen((v) => !v)}>Mute</button>}
          </div>
          {muteOpen && !conn.muted_until ? (
            <div className="ci-mute">{MUTE_OPTIONS.map(([v, l]) => <button key={v} className="pill ghost" onClick={() => { setMuteOpen(false); void pref({ mute: v }); }}>{l}</button>)}</div>
          ) : null}
          <div className="ci-row">
            <span>{Icon.pin(19)}</span><b>Pin chat</b>
            <button type="button" role="switch" aria-checked={!!conn.pinned} aria-label="Pin chat" className={`rs-switch${conn.pinned ? " on" : ""}`} onClick={() => pref({ pinned: !conn.pinned })} />
          </div>
          <div className="ci-row">
            <span>{Icon.archive(19)}</span><b>Archive chat</b>
            <button type="button" role="switch" aria-checked={!!conn.archived} aria-label="Archive chat" className={`rs-switch${conn.archived ? " on" : ""}`} onClick={() => pref({ archived: !conn.archived })} />
          </div>
          {conn.is_sender ? <Link href="/chat-setup" className="ci-row"><span>{Icon.door(19)}</span><b>Your Room settings</b></Link> : null}
        </div>

        <div className="ci-group danger">
          <button className="ci-row" onClick={onClear}><b>Clear chat</b></button>
          {onRemove ? <button className="ci-row" onClick={onRemove}><b>Remove {name} from your Room</b></button> : null}
          <button className="ci-row" onClick={onBlock}><b>Block {name}</b></button>
          <button className="ci-row" onClick={onReport}><b>Report {name}</b></button>
        </div>
        <p className="mx-foot">Your real name, number and location stay hidden.</p>
      </div>
      {open ? (
        <div className="u-modal" onClick={() => setOpen(null)}>
          {open.media_type === "video" ? <video src={open.media_url || undefined} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} />
            : <Image src={open.media_url || ""} alt="" width={800} height={1000} />}
          <button className="u-modal-x" aria-label="Close" onClick={() => setOpen(null)}><X size={20} strokeWidth={2} aria-hidden /></button>
        </div>
      ) : null}
    </div>
  );
}
