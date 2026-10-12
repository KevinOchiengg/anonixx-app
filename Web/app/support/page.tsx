import type { Metadata } from "next";
import SupportPage from "@/components/SupportPage";

export const metadata: Metadata = { title: "Support", robots: { index: false } };

export default function Page() {
  return <SupportPage />;
}
