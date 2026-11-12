"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { api, compact } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import AppShell from "./AppShell";
import { Bookmark, ChevronRight, Coins, Crown, Headphones, Lock, Settings, ShieldCheck, Wallet } from "lucide-react";

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
          {user.avatar_url ? <Image src={user.avatar_url} alt="" width={84} height={84} /> : <span>{name.slice(0, 1).toUpperCase()}</span>}
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
        <span className="ibox gold"><Wallet size={18} strokeWidth={2} aria-hidden /></span>
        <span className="grow"><b>Dashboard</b><small>Your posts, views and earnings</small></span><ChevronRight className="row-chev" size={18} strokeWidth={2} aria-hidden />
      </Link>

      <Link href="/coins" className="prof-card">
        <span className="ibox gold"><Coins size={18} strokeWidth={2} aria-hidden /></span>
        <span className="grow"><b>{user.coin_balance} coins</b><small>Top up or withdraw</small></span><ChevronRight className="row-chev" size={18} strokeWidth={2} aria-hidden />
      </Link>

      {user.is_premium ? (
        <Link href="/premium" className="prof-card prem-on">
          <span className="ibox gold"><Crown size={18} strokeWidth={2} aria-hidden /></span>
          <span className="grow"><b>Premium</b><small>{user.premium_until ? `Active until ${new Date(user.premium_until).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : "Active"}</small></span><ChevronRight className="row-chev" size={18} strokeWidth={2} aria-hidden />
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
        <li><Link href="/change-password" className="row-item"><span className="ibox"><Lock size={18} strokeWidth={2} aria-hidden /></span><span className="grow"><b>Email &amp; password</b></span><ChevronRight className="row-chev" size={18} strokeWidth={2} aria-hidden /></Link></li>
        <li><Link href="/saved" className="row-item"><span className="ibox"><Bookmark size={18} strokeWidth={2} aria-hidden /></span><span className="grow"><b>Saved posts</b></span><ChevronRight className="row-chev" size={18} strokeWidth={2} aria-hidden /></Link></li>
        <li><Link href="/support" className="row-item"><span className="ibox"><Headphones size={18} strokeWidth={2} aria-hidden /></span><span className="grow"><b>Support</b></span><ChevronRight className="row-chev" size={18} strokeWidth={2} aria-hidden /></Link></li>
        <li><Link href="/settings" className="row-item"><span className="ibox"><Settings size={18} strokeWidth={2} aria-hidden /></span><span className="grow"><b>Settings</b></span><ChevronRight className="row-chev" size={18} strokeWidth={2} aria-hidden /></Link></li>
        {user.is_admin ? <li><Link href="/admin" className="row-item"><span className="ibox"><ShieldCheck size={18} strokeWidth={2} aria-hidden /></span><span className="grow"><b>Admin</b></span><ChevronRight className="row-chev" size={18} strokeWidth={2} aria-hidden /></Link></li> : null}
      </ul>
    </div>
  );
}

export default function ProfilePage() {
  return <AppShell title="You" right={<Link href="/settings" aria-label="Settings" className="u-icon"><Settings size={19} strokeWidth={2} aria-hidden /></Link>}><Inner /></AppShell>;
}
