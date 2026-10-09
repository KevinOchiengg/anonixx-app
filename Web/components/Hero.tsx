import Link from "next/link";

// Server-rendered first slide on the home page — gives crawlers the h1 and the pitch.
export default function Hero({ index }: { index: number }) {
  return (
    <section className="slide g0 hero" data-idx={index}>
      <h1>
        Say what you can&apos;t say <em>out loud.</em>
      </h1>
      <p>
        Anonymous confessions, written at 3am for someone who might be reading. Drop yours, stay hidden, and link up
        only if you both want to.
      </p>
      <div className="cta">
        <Link href="/signup" className="pill">Join free</Link>
        <span className="pill ghost">Keep scrolling</span>
      </div>
      <div className="scroll-cue">swipe up ↑</div>
    </section>
  );
}
