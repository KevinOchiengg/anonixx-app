import type { Metadata } from "next";
import BulkVideos from "@/components/admin/BulkVideos";

export const metadata: Metadata = { title: "Bulk videos", robots: { index: false } };

export default function Page() {
  return <BulkVideos />;
}
