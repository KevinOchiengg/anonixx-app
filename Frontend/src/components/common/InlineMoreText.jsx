/**
 * InlineMoreText.jsx
 *
 * A caption that reads like TikTok's: it fills exactly `lines` lines and ends
 * "… more" inline, as if part of the sentence — same as the website's feed
 * (Web/components/Slide.tsx). Expanded, it shows everything with an inline
 * "less". Taps are handled by whatever wraps it (the whole caption toggles).
 *
 * How much fits is measured, not guessed from a character count: a hidden
 * copy lays out the full text at the same width (onTextLayout reports each
 * line), the first `lines` lines are kept with room made for "… more", and
 * the visible text re-checks itself and trims a little more if the suffix
 * still pushed it onto another line.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

const SUFFIX_ROOM = 8;   // characters given up for "… more" (bold, so a little wider than it reads)
const STEP = 6;          // further trim per re-check

const tidy = (s) => s.replace(/[\s.,;:!?-]+$/, '');

function trimTo(text, len) {
  let cut = Math.max(0, len);
  const space = text.lastIndexOf(' ', cut);
  if (space > cut - 14 && space > 0) cut = space;   // end on a whole word when one is close
  return tidy(text.slice(0, cut));
}

export default function InlineMoreText({ text, style, moreStyle, lines = 2, expanded = false }) {
  const [short, setShort] = useState(undefined);   // undefined = measuring, null = fits, string = cut
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
    if (laid.length <= lines) { setShort(null); return; }
    const head = laid.slice(0, lines).map((l) => l.text).join('');
    setShort(trimTo(head, head.length - SUFFIX_ROOM));
  }, [lines]);

  // The visible version re-checks itself: if "… more" still wrapped, trim a bit more.
  const onVisibleLayout = useCallback((e) => {
    if (typeof short !== 'string' || expanded) return;
    if ((e.nativeEvent.lines || []).length > lines && short.length > STEP) {
      setShort(trimTo(short, short.length - STEP));
    }
  }, [short, expanded, lines]);

  return (
    <View onLayout={onLayout}>
      {/* hidden full copy at the same width, only for measuring */}
      {short === undefined && (
        <Text style={[style, s.measure]} onTextLayout={onMeasure} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {text}
        </Text>
      )}
      {expanded && typeof short === 'string' ? (
        <Text style={style}>
          {text}{' '}<Text style={moreStyle}>less</Text>
        </Text>
      ) : typeof short === 'string' ? (
        <Text style={style} onTextLayout={onVisibleLayout}>
          {short}…{' '}<Text style={moreStyle}>more</Text>
        </Text>
      ) : (
        // measuring (first frame) or it fits: clamp so it never overflows meanwhile
        <Text style={style} numberOfLines={short === null ? undefined : lines}>{text}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  measure: { position: 'absolute', left: 0, right: 0, opacity: 0 },
});
