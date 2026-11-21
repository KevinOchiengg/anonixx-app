/** "Knock at Name’s door", centered; only the name shortens (with an ellipsis) when space runs out. */
export default function KnockLabel({ name }: { name?: string | null }) {
  const who = name?.trim();
  if (!who) return <span className="knock-label">Knock at their door</span>;

  const suffix = /s$/i.test(who) ? "’ door" : "’s door";
  return (
    <span className="knock-label">
      <span className="knock-fixed">Knock at&nbsp;</span>
      <span className="knock-name">{who}</span>
      <span className="knock-fixed">{suffix}</span>
    </span>
  );
}
