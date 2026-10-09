import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <h1>That confession is gone.</h1>
      <p>It may have been taken down or never existed. There&apos;s plenty more.</p>
      <div className="cta">
        <Link href="/" className="pill">Back to the feed</Link>
      </div>
    </main>
  );
}
