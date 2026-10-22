/**
 * captionHook.js
 *
 * Splits an admin caption into its hook (the first sentence, or the first line if it
 * breaks sooner) and the rest — the hook is set in the brand serif, the rest in plain
 * text. Same rules as the website (Web/lib/captionHook.ts). Captions with no clear
 * first sentence, or nothing after it, have no hook.
 */
const MIN = 8;
const MAX = 140;

// The first sentence end that really ends a sentence: "?" inside a quote followed by a
// lowercase word ('She texted "are you up?" at 2am.') is mid-sentence, so keep looking.
function firstSentence(t) {
  const end = /[.!?…]+(["”’)\]]*)(\s+)(?=(\S))/g;
  for (let m = end.exec(t); m; m = end.exec(t)) {
    const next = m[3];
    if (m[1].length > 0 && next === next.toLowerCase() && next !== next.toUpperCase()) continue;
    return { head: t.slice(0, m.index + m[0].length - m[2].length), tail: t.slice(m.index + m[0].length) };
  }
  return null;
}

export function splitHook(text) {
  const t = (text || '').trim();
  const nl = t.indexOf('\n');
  const sentence = firstSentence(t);
  let hook = '';
  let rest = '';
  if (nl > 0 && (!sentence || nl < sentence.head.length)) {
    hook = t.slice(0, nl).trim();
    rest = t.slice(nl + 1).trim();
  } else if (sentence) {
    hook = sentence.head.trim();
    rest = sentence.tail.trim();
  }
  return hook.length >= MIN && hook.length <= MAX && rest ? { hook, rest } : null;
}
