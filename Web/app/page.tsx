import type { Metadata } from "next";
import Feed from "@/components/Feed";
import { fetchPublicFeed, SITE_URL } from "@/lib/api";

export const revalidate = 60;

// Set here, not in the layout: a canonical in the layout would leak to every page without its own.
export const metadata: Metadata = { alternates: { canonical: "/" } };

const PLAY = process.env.NEXT_PUBLIC_PLAY_STORE_URL;
const DESCRIPTION =
  "Read anonymous confessions people could never say out loud. Drop yours, stay hidden, and link up only if you both want to.";

export default async function Home() {
  const page = await fetchPublicFeed();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: "Anonixx", url: SITE_URL, description: DESCRIPTION, publisher: { "@id": `${SITE_URL}/#org` } },
      {
        "@type": "Organization", "@id": `${SITE_URL}/#org`, name: "Anonixx", url: SITE_URL,
        logo: `${SITE_URL}/icon.png`, description: DESCRIPTION, email: "support@anonixx.com",
        ...(PLAY ? { sameAs: [PLAY] } : {}),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Feed initialPosts={page?.posts ?? []} initialCursor={page?.next_cursor ?? null} withHero />
    </>
  );
}
