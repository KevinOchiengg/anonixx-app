import type { Metadata } from "next";
import MarketItemPage from "@/components/MarketItemPage";

export const metadata: Metadata = { title: "Market", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MarketItemPage id={id} />;
}
