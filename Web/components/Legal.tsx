export type LegalDoc = { title: string; updated: string; sections: { h: string; p: string }[] };

export function Legal({ doc }: { doc: LegalDoc }) {
  return (
    <main className="page legal">
      <a href="/" className="back">← Back</a>
      <h1>{doc.title}</h1>
      <p className="muted">{doc.updated}</p>
      {doc.sections.map((s) => (
        <section key={s.h}>
          <h2>{s.h}</h2>
          <p>{s.p}</p>
        </section>
      ))}
    </main>
  );
}
