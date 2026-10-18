import type { Metadata } from "next";
import PostStudio from "@/components/admin/PostStudio";

export const metadata: Metadata = { title: "Post a drop", robots: { index: false } };

export default function Page() {
  return <PostStudio />;
}
