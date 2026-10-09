import type { Metadata } from "next";
import { EditProfilePage } from "@/components/AccountPages";

export const metadata: Metadata = { title: "Edit profile", robots: { index: false } };

export default function Page() {
  return <EditProfilePage />;
}
