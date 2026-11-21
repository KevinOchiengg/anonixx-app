import type { Metadata } from "next";
import EarningsPage from "@/components/lives/EarningsPage";

export const metadata: Metadata = { title: "Earnings", robots: { index: false } };

export default function Page() {
  return <EarningsPage />;
}
