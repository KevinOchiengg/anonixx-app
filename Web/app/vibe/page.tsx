import type { Metadata } from "next";
import VibePage from "@/components/VibePage";

export const metadata: Metadata = { title: "Vibe score", robots: { index: false } };

export default function Page() {
  return <VibePage />;
}
