/** Splits a caption into a hook (first sentence or line, in the serif) and the rest. Short
 * captions are all hook; long ones without a clear sentence open with a few words. Same as the website. */
const MIN = 8;
const MAX = 140;
const SHORT = 48;       // a caption this short is all hook
const OPEN_MAX = 40;    // …or up to a comma / dash within this many characters

function opening(t) {
  if (!t) return null;
  if (t.length <= SHORT && !t.includes('\n')) return { hook: t, rest: '' };
  const clause = t.slice(0, OPEN_MAX).match(/^(.{6,}?[,;:—–-])\s+/);
  if (clause) return { hook: clause[1], rest: t.slice(clause[0].length), inline: true };
  // up to OPEN_WORDS words, always leaving at least one for the rest (line breaks kept)
  const words = t.match(/^(\S+(?:[ 	]+\S+){0,3})\s+(?=\S)/);
  if (!words) return { hook: t, rest: '' };
  return { hook: words[1], rest: t.slice(words[0].length), inline: true };
}

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
  return hook.length >= MIN && hook.length <= MAX && rest ? { hook, rest } : opening(t);
}
