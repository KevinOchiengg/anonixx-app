import type { Metadata } from "next";
import ActivityPage from "@/components/ActivityPage";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default function Page() {
  return <ActivityPage />;
}
