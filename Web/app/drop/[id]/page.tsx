import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Feed from "@/components/Feed";
import RestrictedDrop from "@/components/RestrictedDrop";
import { fetchPublicDrop, fetchPublicFeed, SITE_URL, teaser } from "@/lib/api";

export const revalidate = 300;

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const drop = await fetchPublicDrop(id);
  if (!drop) return { title: "Not found", robots: { index: false } };

  if (drop.restricted) {
    return { title: "Adults only", robots: { index: false, follow: false } };
  }

  const { post } = drop;
  const description = teaser(post.content) || "An anonymous confession on Anonixx.";
  const image = post.card_image_url || post.image_url || post.images?.[0] || undefined;
  const title = `“${teaser(post.content, 60)}”`;

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/drop/${id}` },
    openGraph: {
      type: "article",
      title: "Someone confessed something on Anonixx",
      description,
      url: `${SITE_URL}/drop/${id}`,
      publishedTime: post.created_at,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
  };
}

export default async function DropPage({ params }: Params) {
  const { id } = await params;
  const drop = await fetchPublicDrop(id);
  if (!drop) notFound();

  if (drop.restricted) return <RestrictedDrop id={id} />;

  const { post } = drop;
  const rest = await fetchPublicFeed();
  const following = (rest?.posts ?? []).filter((p) => p.id !== post.id);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SocialMediaPosting",
    headline: teaser(post.content, 110),
    articleBody: post.content,
    datePublished: post.created_at,
    url: `${SITE_URL}/drop/${post.id}`,
    author: { "@type": "Person", name: post.anonymous_name || "Anonymous" },
    publisher: { "@type": "Organization", name: "Anonixx", url: SITE_URL },
    interactionStatistic: [
      { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: post.likes_count },
      { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: post.thread_count },
    ],
    ...(post.card_image_url ? { image: post.card_image_url } : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Feed initialPosts={[post, ...following]} initialCursor={rest?.next_cursor ?? null} startId={post.id} />
    </>
  );
}
