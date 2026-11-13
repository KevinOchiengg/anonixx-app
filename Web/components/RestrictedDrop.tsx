"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Feed from "./Feed";

export default function RestrictedDrop({ id }: { id: string }) {
  const { user, ready } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    api<{ post: Post }>(`/drops/single/${id}`)
      .then((r) => setPost(r.post))
      .catch(() => setFailed(true));
  }, [ready, user, id]);

  if (post) return <Feed initialPosts={[post]} initialCursor={null} startId={id} />;

  return (
    <main className="page">
      <h1>This one&apos;s for adults.</h1>
      {!ready ? (
        <p>Checking…</p>
      ) : user && !failed ? (
        <p>Loading…</p>
      ) : user ? (
        <>
          <p>Can&apos;t show this one. It&apos;s gone, or it&apos;s 18+ only.</p>
          <div className="cta">
            <Link href="/settings" className="pill">Confirm my age</Link>
            <Link href="/" className="pill ghost">Back to the feed</Link>
          </div>
        </>
      ) : (
        <>
          <p>Some confessions are 18+ only. Sign in to see them.</p>
          <div className="cta">
            <Link href={`/login?next=/drop/${id}`} className="pill">Sign in</Link>
            <Link href={`/signup?next=/drop/${id}`} className="pill ghost">Join free</Link>
          </div>
        </>
      )}
    </main>
  );
}
