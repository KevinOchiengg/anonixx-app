/**
 * DemoChatScreen.jsx
 *
 * The "anonixx" row pinned at the top of MessagesScreen opens here — a
 * scripted, fully local walkthrough of what a real room looks like once
 * you've unlocked someone's confession: their own background, their own
 * welcome gallery, the same call icons / voice notes / room menu that
 * DropChatScreen renders for real connections. No backend calls, nothing
 * here is a real connection — it exists so the Messages tab is never just
 * a blank list for someone who hasn't unlocked anyone yet.
 */
import React, { useMemo, useState } from 'react';
import {
  ScrollView, StyleSheet, Text, TouchableOpacity, View, TextInput, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft, Flame, Phone, Video, MoreVertical, Mic, Send, Play, Users, Settings,
} from 'lucide-react-native';

import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import ChatBackground from '../../components/chat/ChatBackground';
import { useToast } from '../../components/ui/Toast';
import T from '../../utils/theme';

const SCRIPT = [
  { type: 'text', text: "every room here looks different." },
  { type: 'text', text: "this is what it feels like once you unlock someone's confession — their background, their font, their voice." },
  { type: 'voice', duration: '0:14' },
  { type: 'text', text: "below is a taste of what a welcome gallery looks like. real ones are set by whoever you unlock." },
];

// Fixed-height bars so the waveform reads as intentional, not random noise —
// same idea as DropChatScreen's VoiceBubble, just without a real audio file
// behind it (nothing in this screen is a real connection).
const DEMO_WAVE = [6, 12, 8, 16, 10, 14, 7, 11, 9, 15, 6, 10];

// Same gradient+symbol placeholder language as DropChatScreen's mood board —
// standing in here for the "3 medias" a real host would upload themselves.
const DEMO_GALLERY = [
  { id: 0, symbol: '🔥', gradient: ['#2a0f18', '#14060a'] },
  { id: 1, symbol: '🌙', gradient: ['#0a0418', '#02030a'] },
  { id: 2, symbol: '😈', gradient: ['#1a0824', '#08020c'] },
];

const DEMO_GUESTS = [
  { name: 'nightowl_92', online: true },
  { name: 'velvet.ash',  online: true },
  { name: 'quietstorm',  online: false },
];

export default function DemoChatScreen({ navigation }) {
  const bubbles = useMemo(() => SCRIPT, []);
  const { showToast } = useToast();
  const [showMenu, setShowMenu] = useState(false);
  const [text, setText] = useState('');

  const nudge = () => showToast({
    type: 'info', message: "That's live once you've unlocked someone's confession.",
  });

  const handleSend = () => {
    if (!text.trim()) return;
    setText('');
    nudge();
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} style={s.headerBtn}>
          <ArrowLeft size={rs(20)} color={T.text} />
        </TouchableOpacity>
        <View style={s.headerTitleRow}>
          <Text style={s.headerTitle}>anonixx</Text>
          <View style={s.onlineDot} />
        </View>

        <View style={s.headerActions}>
          <TouchableOpacity style={[s.headerActionBtn, s.headerActionBtnLive]} onPress={nudge} hitSlop={HIT_SLOP}>
            <Phone size={rs(15)} color={T.primary} strokeWidth={1.8} />
            <View style={s.liveDot} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.headerActionBtn, s.headerActionBtnLive]} onPress={nudge} hitSlop={HIT_SLOP}>
            <Video size={rs(15)} color={T.primary} strokeWidth={1.8} />
            <View style={s.liveDot} />
          </TouchableOpacity>
          <TouchableOpacity style={s.headerActionBtn} onPress={() => setShowMenu(true)} hitSlop={HIT_SLOP}>
            <MoreVertical size={rs(15)} color={T.textMute} strokeWidth={1.8} />
          </TouchableOpacity>
        </View>
      </View>

      <ChatBackground pattern="ink-bloom" style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {bubbles.map((b, i) => (
            <View key={i} style={s.bubbleRow}>
              {b.type === 'voice' ? (
                <TouchableOpacity style={s.voiceBubble} onPress={nudge} activeOpacity={0.85}>
                  <View style={s.voicePlayBtn}>
                    <Play size={rs(13)} color={T.primary} strokeWidth={2.2} fill={T.primary} />
                  </View>
                  <View style={s.voiceBars}>
                    {DEMO_WAVE.map((h, j) => (
                      <View key={j} style={[s.voiceBar, { height: rs(h), backgroundColor: j < 3 ? T.primary : 'rgba(255,255,255,0.14)' }]} />
                    ))}
                  </View>
                  <Text style={s.voiceTime}>{b.duration}</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.bubble}>
                  <Text style={s.bubbleText}>{b.text}</Text>
                </View>
              )}
            </View>
          ))}

          <Text style={s.galleryLabel}>welcome gallery — a preview</Text>
          <View style={s.galleryRow}>
            {DEMO_GALLERY.map((card) => (
              <LinearGradient key={card.id} colors={card.gradient} style={s.galleryTile}>
                <Text style={s.galleryTileSymbol}>{card.symbol}</Text>
              </LinearGradient>
            ))}
          </View>
          <Text style={s.galleryHint}>
            up to 3 images, gifs, or clips — whoever you unlock sets their own.
          </Text>

          <TouchableOpacity
            style={s.cta}
            onPress={() => navigation.navigate('Feed')}
            activeOpacity={0.88}
          >
            <Flame size={rs(16)} color="#fff" />
            <Text style={s.ctaText}>See confessions in your feed</Text>
          </TouchableOpacity>
          <Text style={s.ctaHint}>unlock someone, and their real room replaces this one.</Text>
        </ScrollView>

        <View style={[s.inputBar, { paddingBottom: rp(16) }]}>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder="say what you came here for…"
            placeholderTextColor={T.textMute}
            multiline
            maxLength={500}
          />
          <TouchableOpacity style={s.micBtn} onPress={nudge} hitSlop={HIT_SLOP}>
            <Mic size={rs(16)} color={T.textMute} strokeWidth={1.6} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.sendBtn, !text.trim() && { opacity: 0.4 }]}
            onPress={handleSend}
            disabled={!text.trim()}
            hitSlop={HIT_SLOP}
            activeOpacity={0.85}
          >
            <Send size={rs(18)} color="#fff" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
      </ChatBackground>

      {/* ── 3-dot menu — same shape as a real room's, filled with a preview ── */}
      <Modal
        visible={showMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMenu(false)}
      >
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowMenu(false)}>
          <TouchableOpacity activeOpacity={1} style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.menuHeaderRow}>
              <Users size={rs(16)} color={T.textMute} strokeWidth={1.8} />
              <Text style={s.menuHeaderText}>Your room, once it's live</Text>
            </View>

            {DEMO_GUESTS.map((g) => (
              <View key={g.name} style={s.guestRow}>
                <View style={s.guestRowLeft}>
                  <View style={s.guestDotWrap}>
                    {g.online && <View style={s.guestOnlineDot} />}
                  </View>
                  <Text style={s.guestName}>{g.name}</Text>
                </View>
                <Text style={s.guestStatus}>{g.online ? 'online' : 'offline'}</Text>
              </View>
            ))}
            <Text style={s.guestFootnote}>
              guests show up here once someone actually unlocks you.
            </Text>

            <View style={s.menuDivider} />

            <TouchableOpacity
              style={s.menuAction}
              onPress={() => { setShowMenu(false); navigation.navigate('ChatProfileSetup'); }}
              hitSlop={HIT_SLOP}
            >
              <Settings size={rs(16)} color={T.text} strokeWidth={1.8} />
              <Text style={s.menuActionText}>Set up your room now</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowMenu(false)}
              hitSlop={HIT_SLOP}
              style={s.cancelBtn}
            >
              <Text style={s.cancelBtnText}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: rp(12),
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  headerBtn: { padding: rp(4), width: rs(28) },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: rp(6) },
  headerTitle: { fontSize: FONT.md, fontWeight: '700', color: T.text, fontFamily: 'PlayfairDisplay-Bold' },
  onlineDot: { width: rs(7), height: rs(7), borderRadius: rs(4), backgroundColor: T.online },

  headerActions: { flexDirection: 'row', alignItems: 'center', gap: rp(6) },
  headerActionBtn: {
    width: rs(30), height: rs(30), borderRadius: rs(15),
    backgroundColor: T.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: T.border, position: 'relative',
  },
  headerActionBtnLive: { borderColor: T.primaryBorder, backgroundColor: T.primaryDim },
  liveDot: {
    position: 'absolute', top: rp(3), right: rp(3),
    width: rs(6), height: rs(6), borderRadius: rs(3),
    backgroundColor: T.online, borderWidth: 1, borderColor: T.background,
  },

  content: { padding: SPACING.md, paddingBottom: rs(24), gap: rp(10) },

  bubbleRow: { alignItems: 'flex-start' },
  // Sharp bottom-right corner — matches the real DropChatScreen, since this
  // whole screen exists to preview what a real chat looks like.
  bubble: {
    maxWidth: '84%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: RADIUS.lg,
    borderBottomRightRadius: rp(4),
    paddingHorizontal: rp(14),
    paddingVertical: rp(11),
  },
  bubbleText: { fontSize: FONT.sm, color: T.text, lineHeight: rf(20) },

  // No background here, same as the real voice notes it's previewing —
  // just layout, no container.
  voiceBubble: {
    flexDirection: 'row', alignItems: 'center', gap: rp(9),
    minWidth: rs(180), maxWidth: '84%',
    paddingVertical: rp(10),
  },
  voicePlayBtn: {
    width: rs(28), height: rs(28), borderRadius: rs(14),
    backgroundColor: T.primaryDim, borderWidth: 1.5, borderColor: T.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  voiceBars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: rp(2), height: rs(18) },
  voiceBar: { width: rs(2.5), borderRadius: rs(1.5) },
  voiceTime: { fontSize: rf(10), fontWeight: '700', color: 'rgba(255,255,255,0.7)' },

  galleryLabel: {
    fontSize: rf(10), fontWeight: '700', color: T.textMute,
    textTransform: 'uppercase', letterSpacing: 1,
    marginTop: SPACING.md, marginBottom: rp(10), textAlign: 'center',
  },
  galleryRow: { flexDirection: 'row', justifyContent: 'center', gap: rp(10) },
  galleryTile: {
    width: rs(74), height: rs(74), borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  galleryTileSymbol: { fontSize: rf(26) },
  galleryHint: {
    fontSize: rf(11), color: T.textMute, fontStyle: 'italic',
    textAlign: 'center', marginTop: rp(10),
  },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(8),
    backgroundColor: T.primary, borderRadius: RADIUS.md,
    paddingVertical: rp(13), marginTop: SPACING.xl,
    shadowColor: T.primary, shadowOffset: { width: 0, height: rs(4) },
    shadowOpacity: 0.4, shadowRadius: rs(10), elevation: 5,
  },
  ctaText: { fontSize: FONT.sm, fontWeight: '700', color: '#fff' },
  ctaHint: { fontSize: rf(11), color: T.textMute, fontStyle: 'italic', textAlign: 'center', marginTop: rp(8) },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: rp(10),
    paddingHorizontal: SPACING.md, paddingTop: rp(10),
    borderTopWidth: 1, borderTopColor: T.border,
    backgroundColor: T.background,
  },
  input: {
    flex: 1, backgroundColor: T.surface, borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.md, paddingVertical: rp(10),
    fontFamily: 'DMSans-Regular', fontSize: FONT.md, color: T.text,
    maxHeight: rs(100), borderWidth: 1, borderColor: T.border,
  },
  micBtn: {
    width: rs(40), height: rs(40), borderRadius: rs(20),
    alignItems: 'center', justifyContent: 'center', marginBottom: rp(2),
  },
  sendBtn: {
    width: rs(44), height: rs(44), borderRadius: rs(22),
    backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: T.primary, shadowOpacity: 0.35, shadowRadius: rs(10),
    shadowOffset: { width: 0, height: rs(3) },
  },

  // 3-dot menu
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: T.surface,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg, paddingBottom: SPACING.xl,
    borderTopWidth: 1, borderTopColor: T.border,
  },
  modalHandle: {
    width: rs(40), height: rs(4), backgroundColor: T.border, borderRadius: rs(2),
    alignSelf: 'center', marginBottom: SPACING.md,
  },
  menuHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: rp(8), marginBottom: SPACING.sm },
  menuHeaderText: { fontFamily: 'PlayfairDisplay-Italic', fontSize: rf(16), color: T.text },
  guestRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: rp(9), borderBottomWidth: 1, borderBottomColor: T.border,
  },
  guestRowLeft: { flexDirection: 'row', alignItems: 'center', gap: rp(8) },
  guestDotWrap: { width: rs(8), height: rs(8), alignItems: 'center', justifyContent: 'center' },
  guestOnlineDot: { width: rs(7), height: rs(7), borderRadius: rs(4), backgroundColor: T.online },
  guestName: { fontFamily: 'DMSans-Regular', fontSize: FONT.sm, color: T.text },
  guestStatus: { fontFamily: 'DMSans-Italic', fontSize: rf(11), color: T.textMute },
  guestFootnote: {
    fontFamily: 'DMSans-Italic', fontSize: rf(11), color: T.textMute,
    marginTop: rp(8), lineHeight: rf(16),
  },
  menuDivider: { height: 1, backgroundColor: T.border, marginVertical: SPACING.sm },
  menuAction: { flexDirection: 'row', alignItems: 'center', gap: rp(10), paddingVertical: rp(12) },
  menuActionText: { fontFamily: 'DMSans-Bold', fontSize: FONT.sm, color: T.text, letterSpacing: 0.2 },
  cancelBtn: { alignItems: 'center', paddingVertical: rp(10) },
  cancelBtnText: { fontFamily: 'DMSans-Italic', fontSize: FONT.sm, color: T.textSec },
});
