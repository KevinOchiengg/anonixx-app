// Splits a caption into its hook (the first sentence, or the first line if it breaks
// sooner) and the rest. The hook is set in the brand serif on its own line, the rest in
// plain sans. Every caption gets an opening: with no clear first sentence, a short
// caption is all hook, and a longer one opens with its first few words in the serif,
// inline, flowing straight into the rest.
const MIN = 8;
const MAX = 140;
const SHORT = 48;       // a caption this short is all hook
const OPEN_WORDS = 4;   // otherwise the inline opening is up to this many words (the {0,3} below)…
const OPEN_MAX = 40;    // …or up to a comma / dash within this many characters

export type Hook = { hook: string; rest: string; inline?: boolean };

function opening(t: string): Hook | null {
  if (!t) return null;
  if (t.length <= SHORT && !t.includes("\n")) return { hook: t, rest: "" };
  const clause = t.slice(0, OPEN_MAX).match(/^(.{6,}?[,;:—–-])\s+/);
  if (clause) return { hook: clause[1], rest: t.slice(clause[0].length), inline: true };
  // up to OPEN_WORDS words, always leaving at least one for the rest (line breaks kept)
  const words = t.match(/^(\S+(?:[ 	]+\S+){0,3})\s+(?=\S)/);
  if (!words) return { hook: t, rest: "" };
  return { hook: words[1], rest: t.slice(words[0].length), inline: true };
}

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

export function splitHook(text: string): Hook | null {
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
  return hook.length >= MIN && hook.length <= MAX && rest ? { hook, rest } : opening(t);
}
