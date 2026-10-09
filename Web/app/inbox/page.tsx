import type { Metadata } from "next";
import InboxPage from "@/components/InboxPage";

export const metadata: Metadata = { title: "Inbox", robots: { index: false } };

export default function Page() {
  return <InboxPage />;
}
