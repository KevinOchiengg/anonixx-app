"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, COST, type Post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Sheet from "./Sheet";

export default function LinkUpSheet({ post, onClose }: { post: Post; onClose: () => void }) {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const short = (user?.coin_balance ?? 0) < COST.linkUp;

  async function go() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ already_unlocked?: boolean; connection_id?: string }>("/unlock-requests", {
        body: { target_type: "drop", target_id: post.id, payment_method: "coins" },
      });
      if (r.already_unlocked && r.connection_id) {
        router.push(`/chat/${r.connection_id}`);
        return;
      }
      refresh();
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const finish = () => {
    onClose();
    router.push("/");
  };

  if (sent) {
    return (
      <Sheet title="Request sent" onClose={finish}>
        <p>They&apos;ll get a quiet nudge that someone wants to link up. You&apos;ll hear back if they say yes.</p>
        <div className="row">
          <button className="pill" onClick={finish}>Back to the feed</button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={`Link up with ${post.anonymous_name || "them"}?`} onClose={onClose}>
      <p>
        Your name stays hidden and they decide whether to accept. It costs <b>{COST.linkUp} coins</b> (free with a
        subscription). You have <b>{user?.coin_balance ?? 0}</b>.
      </p>
      {error ? <div className="err">{error}</div> : null}
      <div className="row">
        {short ? <Link href="/coins" className="pill">Get coins</Link> : null}
        <button className={short ? "pill ghost" : "pill"} onClick={go} disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </button>
        <button className="pill ghost" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}
