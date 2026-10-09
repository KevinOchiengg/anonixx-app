import type { Metadata } from "next";
import { SignupForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Join Anonixx", robots: { index: false } };

export default function Page() {
  return <SignupForm />;
}
