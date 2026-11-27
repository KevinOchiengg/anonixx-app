/** One rule: the caption's first line (before the first Enter) is the hook, in the serif;
 * the rest is plain. No line break, no hook. Same as the website. */
export function splitHook(text) {
  const t = (text || '').trim();
  const nl = t.indexOf('\n');
  if (nl <= 0) return null;
  const hook = t.slice(0, nl).trim();
  const rest = t.slice(nl + 1).trim();
  return hook && rest ? { hook, rest } : null;
}
