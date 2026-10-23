import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Feed from "@/components/Feed";
import RestrictedDrop from "@/components/RestrictedDrop";
import { fetchPublicDrop, isThinDrop, SITE_URL, teaser } from "@/lib/api";

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
  const image = post.card_image_url || post.cover_url || post.image_url || post.images?.[0] || `${SITE_URL}/og/drop/${id}`;
  const quote = teaser(post.content, 60);
  const title = quote ? `“${quote}”` : "An anonymous confession";

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/drop/${id}` },
    // Short drops nobody has reacted to are thin pages: keep them out of the index, keep links followed.
    ...(isThinDrop(post) ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: "article",
      title: "Someone confessed something on Anonixx",
      description,
      url: `${SITE_URL}/drop/${id}`,
      publishedTime: post.created_at,
      images: [{ url: image }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function DropPage({ params }: Params) {
  const { id } = await params;
  const drop = await fetchPublicDrop(id);
  if (!drop) notFound();

  if (drop.restricted) return <RestrictedDrop id={id} />;

  const { post } = drop;
  const org = { "@type": "Organization", name: "Anonixx", url: SITE_URL, logo: `${SITE_URL}/icon.png` };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SocialMediaPosting",
    headline: teaser(post.content, 110),
    articleBody: post.content,
    datePublished: post.created_at,
    url: `${SITE_URL}/drop/${post.id}`,
    author: post.is_admin_drop ? org : { "@type": "Person", name: post.anonymous_name || "Anonymous" },
    publisher: org,
    interactionStatistic: [
      { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: post.likes_count },
      { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: post.thread_count },
    ],
    ...(post.card_image_url ? { image: post.card_image_url } : {}),
  };
  // Video drops also describe the video itself, so they can show up in Google's video results.
  const thumb = post.cover_url || post.card_image_url;
  const videoLd = post.media_type === "video" && post.video_url && thumb ? {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: teaser(post.content, 100) || "An anonymous confession on Anonixx",
    description: teaser(post.content) || "An anonymous video confession on Anonixx.",
    thumbnailUrl: [thumb],
    uploadDate: post.created_at,
    contentUrl: post.video_url,
    embedUrl: `${SITE_URL}/drop/${post.id}`,
    publisher: org,
  } : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {videoLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(videoLd) }} /> : null}
      {/* The drop's own text is the page's h1 (Slide headline); a drop with no text still needs one. */}
      {post.content?.trim() ? null : <h1 className="sr-only">An anonymous confession on Anonixx</h1>}
      {/* Only this drop is server-rendered, so every drop page's HTML is its own; the rest of the
          feed loads in the browser (fillAfterStart). */}
      <Feed initialPosts={[post]} initialCursor={null} startId={post.id} fillAfterStart />
    </>
  );
}
