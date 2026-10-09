import type { Metadata } from "next";
import DashboardPage from "@/components/DashboardPage";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default function Page() {
  return <DashboardPage />;
}
