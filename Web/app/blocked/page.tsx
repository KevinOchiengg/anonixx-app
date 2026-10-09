import type { Metadata } from "next";
import { BlockedPage } from "@/components/AccountPages";

export const metadata: Metadata = { title: "Blocked", robots: { index: false } };

export default function Page() {
  return <BlockedPage />;
}
