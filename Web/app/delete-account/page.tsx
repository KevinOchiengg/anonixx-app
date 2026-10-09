import type { Metadata } from "next";
import { Legal, type LegalDoc } from "@/components/Legal";

export const metadata: Metadata = { title: "Delete your Anonixx account" };

const doc: LegalDoc = {
  title: "Delete your account",
  updated: "How to erase your Anonixx account and data",
  sections: [
    { h: "In the app", p: "Open Settings, tap Delete account, enter your password and confirm. Your account is erased straight away." },
    { h: "On the website", p: "Sign in, open Settings, scroll to Delete account, enter your password and confirm." },
    { h: "Can't sign in?", p: "Email privacy@anonixx.app from the address on your account with the subject \"Delete my account\". We will erase it within 30 days." },
    { h: "What is deleted", p: "Your profile, your posts, your chats, your saved items and your sign-in details. Unused coins and any active subscription are lost and are not refunded. Cancel a Google Play subscription in Google Play > Payments & subscriptions > Subscriptions." },
    { h: "What we keep", p: "Reports and safety records needed to protect other members, and payment records we are legally required to keep, are retained for up to 12 months and are not linked to a public profile." },
  ],
};

export default function Page() {
  return <Legal doc={doc} />;
}
