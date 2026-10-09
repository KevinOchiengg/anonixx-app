import type { Metadata } from "next";
import { ChangePasswordPage } from "@/components/AccountPages";

export const metadata: Metadata = { title: "Change password", robots: { index: false } };

export default function Page() {
  return <ChangePasswordPage />;
}
