import type { Metadata } from "next";
import RoomPage from "@/components/RoomPage";

export const metadata: Metadata = { title: "Room", robots: { index: false } };

export default async function Page({
  params, searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ post?: string }>;
}) {
  const { userId } = await params;
  const { post } = await searchParams;
  return <RoomPage userId={userId} postId={post || null} />;
}
