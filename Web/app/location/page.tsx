import type { Metadata } from "next";
import { LocationPage } from "@/components/AccountPages";

export const metadata: Metadata = { title: "Feed location", robots: { index: false } };

export default function Page() {
  return <LocationPage />;
}
