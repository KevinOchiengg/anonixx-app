import type { Metadata } from "next";
import GoLivePage from "@/components/lives/GoLivePage";

export const metadata: Metadata = { title: "Go live", robots: { index: false } };

export default function Page() {
  return <GoLivePage />;
}
