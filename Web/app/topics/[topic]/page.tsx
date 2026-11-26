import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchPublicTopic, SITE_URL, teaser } from "@/lib/api";

export const revalidate = 900;

type Params = { params: Promise<{ topic: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { topic } = await params;
  const page = await fetchPublicTopic(topic);
  if (!page) return { title: "Not found", robots: { index: false } };
  const title = `${page.label} confessions`;
  const description = `Anonymous ${page.label.toLowerCase()} confessions. Real stories, no names, no trace.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/topics/${topic}` },
    ...(page.posts.length < 3 ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description, url: `${SITE_URL}/topics/${topic}` },
  };
}

export default async function TopicPage({ params }: Params) {
  const { topic } = await params;
  const page = await fetchPublicTopic(topic);
  if (!page) notFound();
  return (
    <main className="topic-page">
      <header>
        <Link href="/" className="topic-brand">Anonixx</Link>
        <h1>{page.label} confessions</h1>
        <p>Said anonymously. Nobody knows who wrote them.</p>
      </header>
      <ol className="topic-list">
        {page.posts.map((p) => (
          <li key={p.id}>
            <Link href={`/drop/${p.id}`}>
              <p>{teaser(p.content, 280) || "A confession with a photo or video."}</p>
              <span>{p.time_ago} · {p.likes_count || 0} likes · {p.thread_count || 0} replies</span>
            </Link>
          </li>
        ))}
      </ol>
      <footer>
        <Link href="/" className="topic-cta">Read more on Anonixx</Link>
      </footer>
    </main>
  );
}
