import type { Metadata } from "next";
import LiveRoom from "@/components/lives/LiveRoom";

export const metadata: Metadata = { title: "Live", robots: { index: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ host?: string }> };

export default async function Page({ params, searchParams }: Props) {
  const [{ id }, { host }] = await Promise.all([params, searchParams]);
  return <LiveRoom id={id} autoStart={host === "1"} />;
}
