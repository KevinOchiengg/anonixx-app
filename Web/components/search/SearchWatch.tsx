"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Post } from "@/lib/api";
import Feed from "../Feed";
import { SEARCH_QUEUE_KEY } from "./AllSearch";

/** Search results in the swipe feed: starts at the tapped drop, then the usual feed after them. */
export default function SearchWatch() {
  const router = useRouter();
  const [queue, setQueue] = useState<{ posts: Post[]; startId: string } | null>(null);

  useEffect(() => {
    try {
      const q = JSON.parse(sessionStorage.getItem(SEARCH_QUEUE_KEY) || "null");
      if (q?.posts?.length) { setQueue(q); return; }
    } catch { /* storage blocked */ }
    router.replace("/search");
  }, [router]);

  if (!queue) return null;
  return <Feed initialPosts={queue.posts} initialCursor={null} startId={queue.startId} fillAfterStart />;
}
