import type { Metadata } from "next";
import CreateAdPage from "@/components/CreateAdPage";

export const metadata: Metadata = { title: "Advertise", robots: { index: false } };

export default function Page() {
  return <CreateAdPage />;
}
