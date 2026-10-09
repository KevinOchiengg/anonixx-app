import type { Metadata } from "next";
import PremiumPage from "@/components/PremiumPage";

export const metadata: Metadata = { title: "Premium", robots: { index: false } };

export default function Page() {
  return <PremiumPage />;
}
