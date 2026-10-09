import type { MetadataRoute } from "next";
import { fetchSitemap, SITE_URL } from "@/lib/api";

export const revalidate = 3600;

const MAX_PAGES = 10; // 10 × 5000 = 50,000 URLs, the sitemap protocol limit

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/join`, changeFrequency: "monthly", priority: 0.4 },
  ];

  const first = await fetchSitemap(0);
  if (!first) return entries;

  const pages = [first];
  for (let p = 1; p < Math.min(first.pages, MAX_PAGES); p++) {
    const next = await fetchSitemap(p);
    if (next) pages.push(next);
  }

  for (const page of pages) {
    for (const item of page.items) {
      entries.push({
        url: `${SITE_URL}/drop/${item.id}`,
        lastModified: item.lastmod,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }
  return entries;
}
