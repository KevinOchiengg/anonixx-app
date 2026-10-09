import Feed from "@/components/Feed";
import { fetchPublicFeed, SITE_URL } from "@/lib/api";

export const revalidate = 60;

export default async function Home() {
  const page = await fetchPublicFeed();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", name: "Anonixx", url: SITE_URL },
      { "@type": "Organization", name: "Anonixx", url: SITE_URL },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Feed initialPosts={page?.posts ?? []} initialCursor={page?.next_cursor ?? null} withHero />
    </>
  );
}
