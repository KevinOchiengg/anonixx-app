import type { Metadata } from "next";
import CoinsPage from "@/components/CoinsPage";

export const metadata: Metadata = { title: "Coins", robots: { index: false } };

export default function Page() {
  return <CoinsPage />;
}
