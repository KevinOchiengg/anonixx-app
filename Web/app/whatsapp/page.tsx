import type { Metadata } from "next";
import WhatsAppPage from "@/components/WhatsAppPage";

export const metadata: Metadata = { title: "Anonymous WhatsApp", robots: { index: false } };

export default function Page() {
  return <WhatsAppPage />;
}
