/**
 * VideoEditorModal.jsx
 *
 * Trim + text-on-video + cover frame for an admin video drop — the app's
 * version of the website's Post Studio editor (Web/components/compose/
 * VideoEditor.tsx), with the same rules (utils/videoEdit.js). The preview is
 * a 9:16 frame laid out exactly like the feed, so text dragged here lands in
 * the same spot for viewers.
 *
 * Gestures use react-native-gesture-handler (wrapped in its own root view —
 * an RN Modal sits outside the app's root, where handlers wouldn't fire).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Play, Pause } from 'lucide-react-native';
import T from '../../utils/theme';
import { rs, rf, rp, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import {
  MAX_CLIP_SECONDS, MIN_CLIP_SECONDS, MAX_OVERLAYS, MAX_OVERLAY_CHARS, fmtTime,
} from '../../utils/videoEdit';

const SIZE = { s: 0.046, m: 0.064, l: 0.088 };   // share of frame width — matches VideoOverlays.jsx / the web
const SIZES = [['s', 'S'], ['m', 'M'], ['l', 'L']];
const STYLES = [['shadow', 'Clean'], ['dark', 'Box'], ['coral', 'Coral']];
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const LINE = 'rgba(255,255,255,0.16)';   // T.border is too faint for controls on black

// ── One draggable text on the preview ──
const EditableOverlay = ({ o, index, stageW, stageH, selected, onSelect, onMove }) => {
  const [h, setH] = useState(0);
  const latest = useRef({ o, onSelect, onMove });
  latest.current = { o, onSelect, onMove };
  const origin = useRef({ x: 0, y: 0 });
  const pan = useMemo(() => (
    Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .onBegin(() => {
        origin.current = { x: latest.current.o.x, y: latest.current.o.y };
        latest.current.onSelect(index);
      })
      .onUpdate((e) => {
        latest.current.onMove(index, {
          x: clamp(origin.current.x + e.translationX / stageW, 0.08, 0.92),
          y: clamp(origin.current.y + e.translationY / stageH, 0.06, 0.94),
        });
      })
  ), [index, stageW, stageH]);

  const fontSize = stageW * (SIZE[o.size] || SIZE.m);
  const boxW = stageW * 0.86;
  return (
    <View
      pointerEvents="box-none"
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
      style={{ position: 'absolute', width: boxW, left: o.x * stageW - boxW / 2, top: o.y * stageH - h / 2, alignItems: 'center', opacity: h ? 1 : 0 }}
    >
      <GestureDetector gesture={pan}>
        <Text
          style={[
            st.ovText,
            { fontSize, lineHeight: fontSize * 1.22, borderRadius: fontSize * 0.38 },
            o.style === 'shadow' ? st.ovShadow : { paddingHorizontal: fontSize * 0.55, paddingVertical: fontSize * 0.22 },
            o.style === 'dark' && st.ovDark,
            o.style === 'coral' && st.ovCoral,
            selected && st.ovSelected,
            !o.text.trim() && st.ovEmpty,
          ]}
        >
          {o.text.trim() || 'your text'}
        </Text>
      </GestureDetector>
    </View>
  );
};

// ── A trim handle: drag to move one end of the window ──
const TrimHandle = ({ left, onDragStart, onDrag }) => {
  const latest = useRef({ onDragStart, onDrag });
  latest.current = { onDragStart, onDrag };
  const pan = useMemo(() => (
    Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .onBegin(() => latest.current.onDragStart())
      .onUpdate((e) => latest.current.onDrag(e.translationX))
  ), []);
  return (
    <GestureDetector gesture={pan}>
      <View style={[st.handle, { left: left - rs(11) }]} hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }} />
    </GestureDetector>
  );
};

export default function VideoEditorModal({ visible, uri, duration, landscape, value, cover, onDone, onClose }) {
  const { width: winW } = useWindowDimensions();
  const stageW = Math.min(winW * 0.62, rs(260));
  const stageH = stageW * (16 / 9);

  const [edit, setEdit] = useState(value);
  const [coverAt, setCoverAt] = useState(cover);
  const [sel, setSel] = useState(null);
  const [now, setNow] = useState(value?.start || 0);
  const [playing, setPlaying] = useState(false);
  const [trackW, setTrackW] = useState(1);
  const editRef = useRef(edit);
  editRef.current = edit;
  const dragFrom = useRef(0);

  // fresh copy each time it opens
  useEffect(() => {
    if (!visible) return;
    setEdit(value);
    setCoverAt(cover);
    setSel(null);
    setNow(value?.start || 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const player = useVideoPlayer(visible && uri ? { uri } : null, (p) => { p.loop = false; });
  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying }) => setPlaying(isPlaying));
    return () => sub.remove();
  }, [player]);
  useEffect(() => {
    if (!visible) { player.pause(); return; }
    // loop inside the window and keep the playhead moving
    const id = setInterval(() => {
      const ct = player.currentTime || 0;
      const { start = 0, end = 0 } = editRef.current || {};
      if (end && player.playing && (ct >= end || ct < start - 0.25)) player.currentTime = start;
      setNow(ct);
    }, 100);
    return () => clearInterval(id);
  }, [visible, player]);

  if (!edit) return null;
  const { start, end, overlays } = edit;
  const cut = duration > MAX_CLIP_SECONDS + 0.5;
  const pos = (t) => (duration ? (t / duration) * trackW : 0);

  const seek = (t) => { player.currentTime = t; setNow(t); };
  const setStart = (t) => {
    const s = clamp(t, 0, duration - MIN_CLIP_SECONDS);
    const e = Math.min(clamp(editRef.current.end, s + MIN_CLIP_SECONDS, s + MAX_CLIP_SECONDS), duration);
    setEdit((v) => ({ ...v, start: s, end: e }));
    seek(s);
  };
  const setEnd = (t) => {
    const e = clamp(t, MIN_CLIP_SECONDS, duration);
    const s = Math.max(0, clamp(editRef.current.start, e - MAX_CLIP_SECONDS, e - MIN_CLIP_SECONDS));
    setEdit((v) => ({ ...v, start: s, end: e }));
    seek(e);
  };
  const toggle = () => {
    if (player.playing) { player.pause(); return; }
    if (now < start || now >= end - 0.05) player.currentTime = start;
    player.play();
  };
  const patch = (i, p) => setEdit((v) => ({ ...v, overlays: v.overlays.map((o, j) => (j === i ? { ...o, ...p } : o)) }));
  const addText = () => {
    if (overlays.length >= MAX_OVERLAYS) return;
    const y = clamp(0.35 + overlays.length * 0.1, 0.1, 0.85);
    setEdit((v) => ({ ...v, overlays: [...v.overlays, { text: '', x: 0.5, y, size: 'm', style: 'dark' }] }));
    setSel(overlays.length);
  };
  const remove = (i) => { setEdit((v) => ({ ...v, overlays: v.overlays.filter((_, j) => j !== i) })); setSel(null); };
  const cur = sel !== null ? overlays[sel] : null;
  const coverHere = coverAt != null && Math.abs(coverAt - now) < 0.2;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={st.safe}>
          <View style={st.header}>
            <TouchableOpacity onPress={() => { player.pause(); onClose(); }} hitSlop={HIT_SLOP}>
              <Text style={st.headerBtn}>Cancel</Text>
            </TouchableOpacity>
            <Text style={st.headerTitle}>Edit video</Text>
            <TouchableOpacity onPress={() => { player.pause(); onDone({ edit, coverAt }); }} hitSlop={HIT_SLOP}>
              <Text style={[st.headerBtn, st.headerDone]}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
            <View style={[st.stage, { width: stageW, height: stageH }]}>
              <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                contentFit={landscape ? 'contain' : 'cover'}
                nativeControls={false}
                pointerEvents="none"
              />
              <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => (sel !== null ? setSel(null) : toggle())} />
              {overlays.map((o, i) => (
                <EditableOverlay
                  key={i} o={o} index={i} stageW={stageW} stageH={stageH}
                  selected={i === sel} onSelect={setSel} onMove={patch}
                />
              ))}
              <TouchableOpacity style={st.playBtn} onPress={toggle} hitSlop={HIT_SLOP}>
                {playing ? <Pause size={rs(16)} color="#fff" fill="#fff" /> : <Play size={rs(16)} color="#fff" fill="#fff" />}
              </TouchableOpacity>
              <Text style={st.clock}>{fmtTime(Math.max(0, now - start))} / {fmtTime(end - start)}</Text>
            </View>

            <View style={st.row}>
              <Text style={st.label}>Trim</Text>
              <Text style={st.len}>{fmtTime(start)} – {fmtTime(end)} · <Text style={st.lenStrong}>{fmtTime(end - start)}</Text> of max 3:00</Text>
            </View>
            {cut && (
              <Text style={st.cut}>This video is {fmtTime(duration)}, so it starts cut to its first 3:00. Drag the handles to pick a different 3 minutes.</Text>
            )}
            <View style={st.track} onLayout={(e) => setTrackW(e.nativeEvent.layout.width || 1)}>
              <View style={st.trackBg} />
              <View style={[st.trackSel, { left: pos(start), width: Math.max(2, pos(end) - pos(start)) }]} />
              {coverAt != null && <View style={[st.coverDot, { left: pos(coverAt) - rs(5) }]} />}
              <View style={[st.playhead, { left: pos(clamp(now, 0, duration)) }]} pointerEvents="none" />
              <TrimHandle
                left={pos(start)}
                onDragStart={() => { dragFrom.current = editRef.current.start; player.pause(); }}
                onDrag={(dx) => setStart(dragFrom.current + (dx / trackW) * duration)}
              />
              <TrimHandle
                left={pos(end)}
                onDragStart={() => { dragFrom.current = editRef.current.end; player.pause(); }}
                onDrag={(dx) => setEnd(dragFrom.current + (dx / trackW) * duration)}
              />
            </View>
            <View style={st.chips}>
              <Chip label="Start here" onPress={() => setStart(now)} />
              <Chip label="End here" onPress={() => setEnd(now)} disabled={now <= start + MIN_CLIP_SECONDS} />
              <Chip label="Reset" onPress={() => setEdit((v) => ({ ...v, start: 0, end: Math.min(duration, MAX_CLIP_SECONDS) }))} />
              <Chip label={coverHere ? '✓ Cover frame' : 'Use this frame as cover'} gold onPress={() => setCoverAt(clamp(now, start, end))} />
            </View>

            <View style={st.row}>
              <Text style={st.label}>Text on video</Text>
              <Chip label="+ Add text" accent onPress={addText} disabled={overlays.length >= MAX_OVERLAYS} />
            </View>
            {cur ? (
              <View style={st.textBox}>
                <TextInput
                  style={st.input}
                  value={cur.text}
                  onChangeText={(v) => patch(sel, { text: v })}
                  placeholder="Say it on the video…"
                  placeholderTextColor={T.textMute}
                  maxLength={MAX_OVERLAY_CHARS}
                  autoFocus
                />
                <View style={st.chips}>
                  {SIZES.map(([k, l]) => <Chip key={k} label={l} on={cur.size === k} onPress={() => patch(sel, { size: k })} />)}
                  <View style={st.sep} />
                  {STYLES.map(([k, l]) => <Chip key={k} label={l} on={cur.style === k} onPress={() => patch(sel, { style: k })} />)}
                </View>
                <View style={st.chips}>
                  <Chip label="Done" onPress={() => setSel(null)} />
                  <Chip label="Delete text" danger onPress={() => remove(sel)} />
                </View>
                <Text style={st.hint}>Drag the text on the video to move it.</Text>
              </View>
            ) : (
              <Text style={st.hint}>
                {overlays.length ? 'Tap a text on the video to edit or move it.' : `Add a line people read before they hear a word. Up to ${MAX_OVERLAYS}.`}
              </Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const Chip = ({ label, onPress, on, accent, gold, danger, disabled }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.8}
    style={[st.chip, on && st.chipOn, accent && st.chipAccent, gold && st.chipGold, disabled && st.chipDisabled]}
  >
    <Text style={[st.chipText, on && st.chipTextOn, accent && st.chipTextAccent, gold && st.chipTextGold, danger && st.chipTextDanger]}>{label}</Text>
  </TouchableOpacity>
);

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: rp(16), paddingVertical: rp(12) },
  headerTitle: { color: T.text, fontSize: FONT.md, fontWeight: '800' },
  headerBtn: { color: T.textSecondary, fontSize: FONT.md, fontWeight: '700' },
  headerDone: { color: T.primary },
  body: { paddingHorizontal: rp(16), paddingBottom: rp(40), gap: rp(12) },

  stage: { alignSelf: 'center', borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: '#000' },
  playBtn: {
    position: 'absolute', left: rp(10), bottom: rp(10), width: rs(36), height: rs(36), borderRadius: rs(18),
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,12,20,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  clock: { position: 'absolute', right: rp(12), bottom: rp(19), color: '#fff', fontSize: rf(12), fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 3 },

  ovText: { color: '#fff', fontWeight: '800', textAlign: 'center', overflow: 'hidden' },
  ovShadow: { textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  ovDark: { backgroundColor: 'rgba(10,12,20,0.62)' },
  ovCoral: { backgroundColor: '#FF634A' },
  ovSelected: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)', borderStyle: 'dashed' },
  ovEmpty: { opacity: 0.6, fontStyle: 'italic' },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: rp(8), flexWrap: 'wrap' },
  label: { color: T.text, fontSize: FONT.sm, fontWeight: '800' },
  len: { color: T.textSecondary, fontSize: rf(13) },
  lenStrong: { color: T.text, fontWeight: '800' },
  cut: { color: T.text, fontSize: rf(13), lineHeight: rf(19), padding: rp(10), borderRadius: RADIUS.md, backgroundColor: 'rgba(255,99,74,0.14)' },

  track: { height: rs(40), justifyContent: 'center' },
  trackBg: { position: 'absolute', left: 0, right: 0, height: rs(8), borderRadius: rs(4), backgroundColor: 'rgba(255,255,255,0.1)' },
  trackSel: { position: 'absolute', height: rs(8), borderRadius: rs(4), backgroundColor: T.primary },
  playhead: { position: 'absolute', top: rs(7), bottom: rs(7), width: 2, marginLeft: -1, backgroundColor: T.text },
  coverDot: { position: 'absolute', top: rs(2), width: rs(10), height: rs(10), borderRadius: rs(5), backgroundColor: '#ffc93c' },
  handle: {
    position: 'absolute', width: rs(22), height: rs(34), borderRadius: rs(8),
    backgroundColor: '#fff', borderWidth: 2, borderColor: T.primary,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8), alignItems: 'center' },
  chip: { paddingHorizontal: rp(12), paddingVertical: rp(6), borderRadius: RADIUS.full, borderWidth: 1, borderColor: LINE },
  chipOn: { backgroundColor: T.primary, borderColor: T.primary },
  chipAccent: { borderColor: T.primary },
  chipGold: { borderColor: '#ffc93c' },
  chipDisabled: { opacity: 0.45 },
  chipText: { color: T.text, fontSize: rf(13), fontWeight: '700' },
  chipTextOn: { color: '#fff' },
  chipTextAccent: { color: T.primary },
  chipTextGold: { color: '#ffc93c' },
  chipTextDanger: { color: '#ff7a6b' },
  sep: { width: 1, height: rs(18), backgroundColor: LINE },

  textBox: { gap: rp(10), padding: rp(12), borderRadius: RADIUS.md, borderWidth: 1, borderColor: LINE },
  input: { color: T.text, fontSize: FONT.md, paddingHorizontal: rp(12), paddingVertical: rp(10), borderRadius: RADIUS.md, borderWidth: 1, borderColor: LINE },
  hint: { color: T.textSecondary, fontSize: rf(12) },
});
