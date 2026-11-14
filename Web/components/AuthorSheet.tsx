"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { api, COST, type Post } from "@/lib/api";
import Sheet from "./Sheet";
import { Link2 } from "./feedicons";
import { MapPin } from "lucide-react";

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
                    <MapPin size={12} strokeWidth={2} aria-hidden />
                    {p.location}
                  </span>
                ) : null}
              </div>


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
                  <p className="u-hint">Free to knock. Coins only if they let you in.</p>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </Sheet>

    </>
  );
}
