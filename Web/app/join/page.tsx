import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Join Anonixx",
  description: "Drop a confession, stay hidden, and link up only if you both want to.",
};

const PLAY = process.env.NEXT_PUBLIC_PLAY_STORE_URL;

export default function Join() {
  return (
    <main className="page">
      <h1>Join Anonixx.</h1>
      <p>
        Like it, vote, and link up — all without anyone knowing it was you. Your name stays hidden until they say yes.
      </p>
      <div className="cta">
        {PLAY ? <a href={PLAY} className="pill">Get it on Google Play</a> : null}
        <Link href="/signup" className="pill">Create an account</Link>
        <Link href="/" className="pill ghost">Back to the feed</Link>
      </div>
    </main>
  );
}
