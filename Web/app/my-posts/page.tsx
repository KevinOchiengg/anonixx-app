import type { Metadata } from "next";
import MyPostsPage from "@/components/MyPostsPage";

export const metadata: Metadata = { title: "My posts", robots: { index: false } };

export default function Page() {
  return <MyPostsPage />;
}
