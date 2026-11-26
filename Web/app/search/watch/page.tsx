import type { Metadata } from "next";
import SearchWatch from "@/components/search/SearchWatch";

export const metadata: Metadata = { title: "Search", robots: { index: false } };

export default function Page() {
  return <SearchWatch />;
}
