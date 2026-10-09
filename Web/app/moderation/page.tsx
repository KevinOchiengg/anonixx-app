import type { Metadata } from "next";
import { ModerationPage } from "@/components/AccountPages";

export const metadata: Metadata = { title: "Flagged posts", robots: { index: false } };

export default function Page() {
  return <ModerationPage />;
}
