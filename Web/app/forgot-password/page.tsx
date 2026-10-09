import type { Metadata } from "next";
import ForgotPassword from "@/components/ForgotPassword";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function Page() {
  return <ForgotPassword />;
}
