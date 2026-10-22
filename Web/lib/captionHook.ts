// Splits an admin caption into its hook (the first sentence, or the first line if it
// breaks sooner) and the rest. The hook is set in the brand serif, the rest in plain
// sans. Captions with no clear first sentence, or nothing after it, have no hook.
const MIN = 8;
const MAX = 140;

// The first sentence end that really ends a sentence: "?" inside a quote followed by a
// lowercase word ('She texted "are you up?" at 2am.') is mid-sentence, so keep looking.
function firstSentence(t: string): [string, string, string, string] | null {
  const end = /[.!?…]+(["”’)\]]*)(\s+)(?=(\S))/g;
  for (let m = end.exec(t); m; m = end.exec(t)) {
    const closedQuote = m[1].length > 0;
    const next = m[3];
    if (closedQuote && next === next.toLowerCase() && next !== next.toUpperCase()) continue;
    const head = t.slice(0, m.index + m[0].length - m[2].length);
    return [t, head, m[2], t.slice(m.index + m[0].length)];
  }
  return null;
}

export function splitHook(text: string): { hook: string; rest: string } | null {
  const t = text.trim();
  const nl = t.indexOf("\n");
  const sentence = firstSentence(t);
  let hook = "";
  let rest = "";
  if (nl > 0 && (!sentence || nl < sentence[1].length)) {
    hook = t.slice(0, nl).trim();
    rest = t.slice(nl + 1).trim();
  } else if (sentence) {
    hook = sentence[1].trim();
    rest = sentence[3].trim();
  }
  return hook.length >= MIN && hook.length <= MAX && rest ? { hook, rest } : null;
}
