import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/api";
import ExpText from "@/components/ExpText";

const DESCRIPTION =
  "Anonixx is the anonymous confession app. Say what you can't say out loud, stay hidden, and link up only if you both want to. 18+.";

export const metadata: Metadata = {
  title: { absolute: "Anonixx: the anonymous confession app" },
  description: DESCRIPTION,
  // Referral links (/join?ref=…) all point back to this one page.
  alternates: { canonical: "/join" },
  openGraph: {
    title: "Anonixx: the anonymous confession app",
    description: DESCRIPTION,
    url: `${SITE_URL}/join`,
    images: [{ url: "/og", width: 1200, height: 630 }],
  },
};

const PLAY = process.env.NEXT_PUBLIC_PLAY_STORE_URL;

const STEPS = [
  { h: "Confess", p: "Write the thing you've been carrying. It posts under a hidden name. Nobody sees your real one." },
  { h: "Get read", p: "Strangers react, reply and vote. You find out how many people feel exactly what you feel." },
  { h: "Link up, maybe", p: "If someone wants to meet the person behind a post, they ask. Nothing happens unless the poster says yes." },
];

const FAQ = [
  { q: "Is Anonixx really anonymous?", a: "Yes. You post under a hidden name you choose. Your email is never shown, and other members never see who you are unless you decide to reveal it." },
  { q: "Is it free?", a: "Posting a confession, reading and reacting are free. Coins unlock extras like hookup posts and link ups. You only pay for a link up if the other person accepts." },
  { q: "Who can use it?", a: "Adults only. You must be 18 or older to join, and mature posts are shown only to signed-in members who have confirmed their age." },
  { q: "How do link ups work?", a: "You ask to link up with the person behind a post or profile. They see the request and choose. If they say no, nothing happens and nobody learns who asked." },
  { q: "How do you keep it safe?", a: "Every post goes through moderation. Sharing phone numbers or contact details in posts is blocked, anyone can be reported or blocked in one tap, and you can delete your account and posts any time." },
  { q: "Where can I use it?", a: PLAY ? "In your browser at anonixx.com, or in the Android app on Google Play." : "Right here in your browser at anonixx.com." },
];

export default function Join() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage", "@id": `${SITE_URL}/join`, url: `${SITE_URL}/join`,
        name: "Anonixx: the anonymous confession app", description: DESCRIPTION,
        isPartOf: { "@id": `${SITE_URL}/#website` },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };

  return (
    <main className="page legal join">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* A/B test "join_headline" on /admin/growth can swap this line; search engines see the default. */}
      <h1><ExpText k="join_headline" fallback="The anonymous confession app." /></h1>
      <p>
        Say what you can&apos;t say out loud. Read what other people never would. Stay hidden the whole time, and link
        up only if you both want to.
      </p>
      <div className="cta">
        <Link href="/signup" className="pill">Join free</Link>
        {PLAY ? <a href={PLAY} className="pill ghost">Get it on Google Play</a> : null}
        <Link href="/" className="pill ghost">Read confessions first</Link>
      </div>

      <section>
        <h2>How Anonixx works</h2>
        {STEPS.map((s) => (
          <p key={s.h}><b>{s.h}.</b> {s.p}</p>
        ))}
      </section>

      <section>
        <h2>Your name stays yours</h2>
        <p>
          No real names, no phone book, no friends list. You pick a hidden name, and that&apos;s all anyone sees. Reveal
          yourself to one person when you&apos;re ready, or never.
        </p>
      </section>

      <section>
        <h2>Questions</h2>
        {FAQ.map((f) => (
          <div key={f.q}>
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}
      </section>

      <div className="cta">
        <Link href="/signup" className="pill">Say it. Stay hidden.</Link>
      </div>
      <p className="muted small">
        18+ only. <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link>
      </p>
    </main>
  );
}
