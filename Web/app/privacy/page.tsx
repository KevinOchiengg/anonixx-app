import type { Metadata } from "next";
import { Legal, type LegalDoc } from "@/components/Legal";

export const metadata: Metadata = { title: "Privacy Policy" };

const doc: LegalDoc = {
  title: "Privacy Policy",
  updated: "Last updated: October 2026",
  sections: [
    { h: "1. What we collect", p: "Your email, date of birth (to confirm you are 18+), an optional gender, the hidden name you choose, and what you post, like, save and send. We do not ask for your real name." },
    { h: "2. How we use it", p: "To run Anonixx: show your posts under your hidden name, open chats you agree to, process payments, keep the community safe and send notifications you've allowed." },
    { h: "3. Anonymity", p: "Your email is never shown publicly. Other members never see who you are unless you choose to reveal it." },
    { h: "4. Advertising and cookies", p: "We show ads only next to general (non-mature) content. Our ad partner, Google, may use cookies to serve ads; you can manage this in your Google ad settings. We store a sign-in token in your browser to keep you signed in." },
    { h: "5. Payments", p: "Payments are handled by Google Play (Android), M-Pesa and Stripe. We receive confirmation of payment but never store your card or mobile-money PIN." },
    { h: "6. Service providers", p: "We use trusted providers for hosting, media storage and notifications. They process data only to provide those services." },
    { h: "7. Retention and deletion", p: "We keep your data while your account is active. Deleting your account from Settings permanently removes your profile and your posts. See anonixx.app/delete-account for all the ways to delete it." },
    { h: "8. Your rights", p: "You can access, correct or delete your data from Settings, or contact us." },
    { h: "9. Contact", p: "privacy@anonixx.app" },
  ],
};

export default function Page() {
  return <Legal doc={doc} />;
}
