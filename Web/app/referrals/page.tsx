import type { Metadata } from "next";
import { ReferralsPage } from "@/components/AccountPages";

export const metadata: Metadata = { title: "Invite friends", robots: { index: false } };

export default function Page() {
  return <ReferralsPage />;
}
