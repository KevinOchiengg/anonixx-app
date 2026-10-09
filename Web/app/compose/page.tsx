import type { Metadata } from "next";
import ComposeForm from "@/components/ComposeForm";

export const metadata: Metadata = { title: "New confession", robots: { index: false } };

export default function Page() {
  return <ComposeForm />;
}
