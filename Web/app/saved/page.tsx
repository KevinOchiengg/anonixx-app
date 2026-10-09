import type { Metadata } from "next";
import SavedPage from "@/components/SavedPage";

export const metadata: Metadata = { title: "Saved", robots: { index: false } };

export default function Page() {
  return <SavedPage />;
}
