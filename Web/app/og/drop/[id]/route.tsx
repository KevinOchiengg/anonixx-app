import { fetchPublicDrop, teaser } from "@/lib/api";
import { ogCard } from "@/lib/ogCard";

export const revalidate = 3600;

// Share card for text-only drops. Restricted (18+) or missing drops get the plain site card,
// so a preview never leaks mature text.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const drop = await fetchPublicDrop(id);
  const quote = drop && !drop.restricted ? teaser(drop.post.content, 160) : "";
  return ogCard(quote || null);
}
