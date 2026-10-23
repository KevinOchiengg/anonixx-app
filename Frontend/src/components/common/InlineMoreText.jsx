/**
 * InlineMoreText.jsx
 *
 * A caption that reads like TikTok's, in the Anonixx voice — same as the website's
 * feed (Web/components/Slide.tsx). With `hookStyle`, the first sentence is a hook in
 * the brand serif (up to two of its lines); then `lines` lines of plain text ending
 * "… more" inline, as if part of the sentence. Expanded, it shows everything with an
 * inline "less". Taps are handled by whatever wraps it (the whole caption toggles).
 *
 * How much fits is measured, not guessed from a character count: a hidden copy lays
 * out the full caption at the same width (onTextLayout reports each line), the hook
 * lines plus `lines` body lines are kept with room made for "… more", and the visible
 * text re-checks itself and trims a little more if the suffix still spilled over.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { splitHook } from '../../utils/captionHook';

const SUFFIX_ROOM = 8;   // characters given up for "… more" (bold, so a little wider than it reads)
const STEP = 6;          // further trim per re-check
const HOOK_MAX_LINES = 2;
// No clear first sentence: the opening words in the serif (same size), sharing the line.
const INLINE_HOOK = { lineHeight: 22 };

const tidy = (s) => s.replace(/[\s.,;:!?-]+$/, '');

function trimTo(text, len) {
  let cut = Math.max(0, len);
  const space = text.lastIndexOf(' ', cut);
  if (space > cut - 14 && space > 0) cut = space;   // end on a whole word when one is close
  return tidy(text.slice(0, cut));
}

export default function InlineMoreText({ text, style, moreStyle, hookStyle, lines = 2, expanded = false }) {
  const parts = useMemo(() => (hookStyle ? splitHook(text) : null), [hookStyle, text]);
  // undefined = measuring, null = fits, { hook, rest, budget } = cut
  const [short, setShort] = useState(undefined);
  useEffect(() => { setShort(undefined); }, [text]);
  // a new width (rotation, split screen) means a new fit
  const width = useRef(0);
  const onLayout = useCallback((e) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (width.current && Math.abs(w - width.current) > 1) setShort(undefined);
    width.current = w;
  }, []);

  const onMeasure = useCallback((e) => {
    const laid = e.nativeEvent.lines || [];
    // how many laid-out lines the hook (plus its line break) takes
    let hookLines = 0;
    if (parts && !parts.inline) {
      let acc = 0;
      for (const l of laid) {
        if (acc >= parts.hook.length + 1) break;
        acc += l.text.length;
        hookLines += 1;
      }
    }
    const budget = Math.min(hookLines, HOOK_MAX_LINES) + lines;
    if (laid.length <= budget) { setShort(null); return; }
    if (parts && hookLines > HOOK_MAX_LINES) {
      // the hook alone is too long: cut the hook itself
      const head = laid.slice(0, HOOK_MAX_LINES).map((l) => l.text).join('');
      setShort({ hook: trimTo(head, head.length - SUFFIX_ROOM), rest: '', budget: HOOK_MAX_LINES });
      return;
    }
    const head = laid.slice(0, budget).map((l) => l.text).join('');
    const body = parts ? head.slice(parts.hook.length + (parts.rest ? 1 : 0)) : head;
    setShort({ hook: parts ? parts.hook : '', rest: trimTo(body, body.length - SUFFIX_ROOM), budget });
  }, [parts, lines]);

  // The visible version re-checks itself: if "… more" still wrapped, trim a bit more.
  const onVisibleLayout = useCallback((e) => {
    if (!short || expanded) return;
    if ((e.nativeEvent.lines || []).length <= short.budget) return;
    if (short.rest.length > STEP) setShort({ ...short, rest: trimTo(short.rest, short.rest.length - STEP) });
    else if (short.hook.length > STEP) setShort({ ...short, hook: trimTo(short.hook, short.hook.length - STEP), rest: '' });
  }, [short, expanded]);

  const full = parts
    ? <><Text style={[hookStyle, parts.inline && INLINE_HOOK]}>{parts.hook}{parts.rest ? (parts.inline ? ' ' : '\n') : ''}</Text>{parts.rest}</>
    : text;

  return (
    <View onLayout={onLayout}>
      {/* hidden full copy at the same width, only for measuring */}
      {short === undefined && (
        <Text style={[style, s.measure]} onTextLayout={onMeasure} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {full}
        </Text>
      )}
      {short && !expanded ? (
        <Text style={style} onTextLayout={onVisibleLayout}>
          {short.hook ? <Text style={[hookStyle, parts?.inline && INLINE_HOOK]}>{short.rest ? `${short.hook}${parts?.inline ? ' ' : '\n'}` : `${short.hook}…`}</Text> : null}
          {short.rest ? `${short.rest}…` : ''}{' '}<Text style={moreStyle}>more</Text>
        </Text>
      ) : short && expanded ? (
        <Text style={style}>
          {full}{' '}<Text style={moreStyle}>less</Text>
        </Text>
      ) : (
        // measuring (first frame) or it fits: clamp so it never overflows meanwhile
        <Text style={style} numberOfLines={short === null ? undefined : (parts && !parts.inline ? HOOK_MAX_LINES : 0) + lines}>{full}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  measure: { position: 'absolute', left: 0, right: 0, opacity: 0 },
});
