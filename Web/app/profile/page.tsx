import type { Metadata } from "next";
import ProfilePage from "@/components/ProfilePage";

export const metadata: Metadata = { title: "You", robots: { index: false } };

export default function Page() {
  return <ProfilePage />;
}
