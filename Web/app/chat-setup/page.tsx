import type { Metadata } from "next";
import ChatSetupPage from "@/components/ChatSetupPage";

export const metadata: Metadata = { title: "Your Chat Interface", robots: { index: false } };

export default function Page() {
  return <ChatSetupPage />;
}
