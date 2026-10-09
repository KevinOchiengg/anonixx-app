import type { Metadata } from "next";
import MarketPage from "@/components/MarketPage";

export const metadata: Metadata = { title: "Market", robots: { index: false } };

export default function Page() {
  return <MarketPage />;
}
