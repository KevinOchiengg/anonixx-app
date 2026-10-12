"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, compact } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import AppShell from "./AppShell";

function Inner() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<number | null>(null);
  const [likes, setLikes] = useState<number | null>(null);
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    api<{ total_posts: number; total_likes: number }>("/drops/mine")
      .then((r) => { setPosts(r.total_posts); setLikes(r.total_likes); })
      .catch(() => { setPosts(0); setLikes(0); });
    api<{ streak: number }>("/rewards/streak").then((r) => setStreak(r.streak)).catch(() => setStreak(0));
  }, []);

  if (!user) return null;
  const name = user.anonymous_name || user.username || "You";

  return (
    <div className="pad prof">
      <div className="prof-top">
        <div className="prof-avatar">
          {user.avatar_url ? <img src={user.avatar_url} alt="" /> : <span>{name.slice(0, 1).toUpperCase()}</span>}
        </div>
        <strong>{name}</strong>
        <small>{user.email}</small>
        {user.bio ? <p className="prof-bio">{user.bio}</p> : null}
      </div>

      <div className="prof-stats">
        <div><b>{posts === null ? "–" : compact(posts)}</b><span>Posts</span></div>
        <div><b>{likes === null ? "–" : compact(likes)}</b><span>Likes</span></div>
        <div><b>{streak === null ? "–" : streak}</b><span>Streak</span></div>
      </div>

      <Link href="/dashboard" className="prof-card">
        <span className="ibox gold">💰</span>
        <span className="grow"><b>Dashboard</b><small>Your posts, views and earnings</small></span>›
      </Link>

      <Link href="/coins" className="prof-card">
        <span className="ibox gold">🪙</span>
        <span className="grow"><b>{user.coin_balance} coins</b><small>Top up or withdraw</small></span>›
      </Link>

      {user.is_premium ? (
        <Link href="/premium" className="prof-card prem-on">
          <span className="ibox gold">👑</span>
          <span className="grow"><b>Premium</b><small>{user.premium_until ? `Active until ${new Date(user.premium_until).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : "Active"}</small></span>›
        </Link>
      ) : (
        <Link href="/premium" className="prof-premium">
          <b>Go Premium</b>
          <small>Post and link up without spending coins.</small>
        </Link>
      )}

      <Link href="/profile/edit" className="btn ghost prof-edit">Edit profile</Link>

      <h2 className="sec">ACCOUNT</h2>
      <ul className="rows links">
        <li><Link href="/change-password" className="row-item"><span className="ibox">🔒</span><span className="grow"><b>Email &amp; password</b></span>›</Link></li>
        <li><Link href="/saved" className="row-item"><span className="ibox">🔖</span><span className="grow"><b>Saved posts</b></span>›</Link></li>
        <li><Link href="/support" className="row-item"><span className="ibox">🎧</span><span className="grow"><b>Support</b></span>›</Link></li>
        <li><Link href="/settings" className="row-item"><span className="ibox">⚙️</span><span className="grow"><b>Settings</b></span>›</Link></li>
        {user.is_admin ? <li><Link href="/admin" className="row-item"><span className="ibox">🛡️</span><span className="grow"><b>Admin</b></span>›</Link></li> : null}
      </ul>
    </div>
  );
}

export default function ProfilePage() {
  return <AppShell title="You" right={<Link href="/settings" aria-label="Settings">⚙️</Link>}><Inner /></AppShell>;
}
