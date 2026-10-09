import type { Metadata } from "next";
import { Legal, type LegalDoc } from "@/components/Legal";

export const metadata: Metadata = { title: "Terms of Service" };

const doc: LegalDoc = {
  title: "Terms of Service",
  updated: "Last updated: October 2026",
  sections: [
    { h: "1. Who we are", p: "Anonixx is an anonymous confession and connection platform for adults. By using it you agree to these terms." },
    { h: "2. Adults only", p: "You must be 18 or older. Some posts are marked mature and are shown only to signed-in members who have confirmed their age. We may ask you to confirm it again." },
    { h: "3. Your anonymous identity", p: "You appear only under your hidden name. Do not use anonymity to harass, threaten, impersonate or expose anyone." },
    { h: "4. What you can post", p: "Honest confessions, feelings and stories. Mature themes are allowed in text. Never post anything involving minors, non-consensual content, threats, hate, doxxing, spam, or anything illegal." },
    { h: "5. Link-ups", p: "A link-up is a request. The other person must accept before any chat opens, and coins only move when they do. You can block and report anyone." },
    { h: "6. Coins and subscriptions", p: "Coins are virtual credits with no cash value. Posting and link-ups cost coins unless you have an active subscription. Refunds can be requested from Settings > Support within the period shown there." },
    { h: "7. Moderation", p: "Posts that get reported are reviewed and may be hidden. We may remove content or suspend accounts that break these terms." },
    { h: "8. Deleting your account", p: "You can permanently delete your account and posts any time from Settings." },
    { h: "9. Not a crisis service", p: "Anonixx is not a substitute for professional care. If you are in danger, contact local emergency services." },
    { h: "10. Changes", p: "We may update these terms. Continuing to use Anonixx means you accept the update." },
  ],
};

export default function Page() {
  return <Legal doc={doc} />;
}
