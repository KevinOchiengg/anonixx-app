import type { Metadata } from "next";
import LivesPage from "@/components/lives/LivesPage";

export const metadata: Metadata = { title: "Lives", description: "Watch anonymous hosts live on Anonixx. Free 30-second preview, then join with coins." };

export default function Page() {
  return <LivesPage />;
}
