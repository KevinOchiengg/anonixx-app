import { ogCard } from "@/lib/ogCard";

export const revalidate = 86400;

export function GET() {
  return ogCard(null);
}
