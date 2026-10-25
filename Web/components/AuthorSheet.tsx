"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { api, COST, type Post } from "@/lib/api";
import Sheet from "./Sheet";
import { Link2 } from "./feedicons";

type Item = { media_url: string; media_type: string };
type Profile = {
  user_id: string;
  is_self: boolean;
  anonymous_name: string;
  avatar_url: string | null;
  confession_count: number;
  connections_count: number;
  reactions_received: number;
  streak: number;
  join_date: string | null;
  location: string | null;
  is_online: boolean;
  last_seen: string | null;
  gender: string | null;
  gallery?: Item[];
};

const GENDER: Record<string, string> = { male: "Male", female: "Female", nonbinary: "Non-binary" };

export default function AuthorSheet({
  post, onClose, onLinkUp,
}: {
  post: Post;
  onClose: () => void;
  onLinkUp: (post: Post) => void;
}) {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [big, setBig] = useState<Item | null>(null);

  useEffect(() => {
    let live = true;
    api<Profile>(`/connect/profile/id/${post.user_id}`)
      .then((r) => { if (live) setP(r); })
      .catch((e) => { if (live) setError((e as Error).message || "Could not load this profile."); });
    return () => { live = false; };
  }, [post.user_id]);

  const name = p?.anonymous_name || post.anonymous_name || "Anonymous";
  const avatar = p?.avatar_url || post.avatar_url;
  // Confessions have no Link up on the card; the profile is where you link up off one.
  const canLinkUp = p ? !p.is_self : false;
  const gallery = (p?.gallery || []).filter((g) => g.media_url);

  return (
    <>
      <Sheet onClose={onClose} tall>
        <div className="ap">
          <div className="ap-avatar">
            {avatar ? <Image src={avatar} alt="" width={84} height={84} /> : name.charAt(0).toUpperCase()}
          </div>
          <h3 className="ap-name">{name}</h3>

          {!p && !error ? <p className="muted">Reading the aura…</p> : null}
          {error ? <p className="err">{error}</p> : null}

          {p ? (
            <>
              {p.is_online || p.last_seen ? (
                <div className={`ap-presence${p.is_online ? " on" : ""}`}>
                  {p.is_online ? <i /> : null}{p.is_online ? "Online now" : p.last_seen}
                </div>
              ) : null}

              <div className="ap-chips">
                {p.gender && GENDER[p.gender] ? <span>{GENDER[p.gender]}</span> : null}
                {p.location ? (
                  <span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                    {p.location}
                  </span>
                ) : null}
              </div>

              {gallery.length ? (
                <div className="ap-gallery">
                  {gallery.map((g, i) => (
                    <button key={i} type="button" onClick={() => setBig(g)} aria-label={`Photo ${i + 1}`}>
                      {g.media_type === "video" ? (
                        <><video src={g.media_url} muted playsInline preload="metadata" /><span className="ap-play">▶</span></>
                      ) : (
                        <Image src={g.media_url} alt="" width={240} height={320} sizes="33vw" />
                      )}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="ap-stats">
                <div><b>{p.confession_count}</b><span>drops</span></div>
                <div><b>{p.connections_count}</b><span>link ups</span></div>
                <div><b>{p.reactions_received}</b><span>reactions</span></div>
                {p.streak > 0 ? <div><b>{p.streak}d</b><span>streak</span></div> : null}
              </div>
              {p.join_date ? <p className="ap-since">Member since {p.join_date}</p> : null}

              {p.is_self ? (
                <p className="u-copy">This is how others see you.</p>
              ) : canLinkUp ? (
                <>
                  <button className="u-cta" onClick={() => { onClose(); onLinkUp(post); }}>
                    <Link2 />Knock<span className="coin-cost">{COST.linkUp}</span>
                  </button>
                  <p className="u-hint">Free to knock. Coins move only if they let you in, and they won&apos;t know it&apos;s you until then.</p>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </Sheet>

      {big ? (
        <div className="ap-lightbox" onClick={() => setBig(null)} role="dialog" aria-modal>
          {big.media_type === "video" ? (
            <video src={big.media_url} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} />
          ) : (
            <Image src={big.media_url} alt="" width={1200} height={1500} sizes="100vw" />
          )}
          <button type="button" aria-label="Close" onClick={() => setBig(null)}>×</button>
        </div>
      ) : null}
    </>
  );
}
