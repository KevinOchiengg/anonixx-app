import { fetchPublicDrop, teaser } from "@/lib/api";
import { BLUR, blurredDropCard, ogCard } from "@/lib/ogCard";

export const revalidate = 3600;

const FETCH_TIMEOUT_MS = 5000;

async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// Every drop shares as a blurred card, so no platform shows (or flags) what it says or shows.
// Restricted (18+) or missing drops get the plain site card.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const drop = await fetchPublicDrop(id);
  if (!drop || drop.restricted) return ogCard(null);

  const { post } = drop;
  const media = post.card_image_url || post.cover_url || post.image_url || post.images?.[0];
  const image = media ? await fetchImage(media) : null;
  if (image) return blurredDropCard(image, BLUR.media);

  const text = Buffer.from(await ogCard(teaser(post.content, 160) || null).arrayBuffer());
  return blurredDropCard(text, BLUR.text);
}
