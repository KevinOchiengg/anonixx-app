import type { Metadata } from "next";
import { SearchPage } from "@/components/AccountPages";

export const metadata: Metadata = { title: "Search", robots: { index: false } };

export default function Page() {
  return <SearchPage />;
}
