import type { Metadata } from "next";
import ChatPage from "@/components/ChatPage";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatPage id={id} />;
}
