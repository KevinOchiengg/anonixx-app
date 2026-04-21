/**
 * DropsPublishScreen.jsx
 *
 * Anonixx Publisher — double-consent flow (spec section 16).
 *
 * A drop only leaves Anonixx (to IG / TikTok / the site) when the user
 * consents TWICE. The second screen is deliberately slower, italic, and
 * names the specific risk: "your words become public."
 *
 * Tier 2 (After Dark) themes are filtered out upstream and cannot reach
 * this screen. If one somehow does, we hard-refuse.
 *
 * Voice drops get an additional acknowledgement: the voice itself will
 * be heard outside Anonixx — we surface that explicitly.
 *
 * Flow:
 *   Step 1  → "Share this anonymously on our social pages?"          [Yes] [Keep private]
 *   Step 2  → "Last check. Your words become public."                [Publish]  [Keep inside Anonixx]
 *            (voice only) + "People outside Anonixx will hear your voice."
 *
 * On confirm the screen navigates back with route.params.onConfirmed()
 * called — the caller (DropsComposeScreen) actually POSTs.
 *
 * Backend-facing:
 *   POST /api/v1/drops/:id/publish   { format: 'voice' | 'text' | 'image' | 'video' }
 *   (or send publisher_opt_in: true when creating the drop — either path)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft, Globe, Lock, Mic, Volume2, AlertTriangle,
} from 'lucide-react-native';

import {
  rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { DROP_THEMES } from '../../components/drops/DropCardRenderer';

// ─── Theme tokens ──────────────────────────────────────────────
const T = {
  background: '#0b0f18',
  surface:    '#151924',
  primary:    '#FF634A',
  text:       '#EAEAF0',
  textSec:    '#9A9AA3',
  textMute:   '#4a4f62',
  border:     'rgba(255,255,255,0.06)',
  warn:       '#FB923C',
  danger:     '#ef4444',
};

export default function DropsPublishScreen({ navigation, route }) {
  const { showToast } = useToast();

  // ── Params from caller ─────────────────────────────────────────
  const {
    format   = 'text',
    theme    = 'cinematic-coral',
    preview  = '',
    onConfirmed,       // callback — caller actually posts
  } = route?.params || {};

  const themeObj = DROP_THEMES[theme] || DROP_THEMES['cinematic-coral'];
  const isVoice  = format === 'voice';
  const isTier2  = themeObj.tier === 2;

  // ── Steps: 1 = soft ask, 2 = final italic confirmation ─────────
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Fade between steps — intentional slowness.
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: step === 1 ? 360 : 620,   // step 2 fades slower on purpose
      useNativeDriver: true,
    }).start();
  }, [step, fade]);

  // ── Tier 2 hard refuse ─────────────────────────────────────────
  useEffect(() => {
    if (isTier2) {
      showToast({
        type: 'warning',
        title: 'Not publishable',
        message: 'After Dark drops stay inside Anonixx. Always.',
      });
      navigation.goBack();
    }
  }, [isTier2, navigation, showToast]);

  // ── Actions ────────────────────────────────────────────────────
  const handleKeepPrivate = useCallback(() => {
    try { onConfirmed?.(false); } catch {}
    navigation.goBack();
  }, [navigation, onConfirmed]);

  const handleAskPublish = useCallback(() => {
    setStep(2);
  }, []);

  const handleConfirmPublish = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    // Deliberate pause — matches the compose-screen delivery tension.
    await new Promise((r) => setTimeout(r, 900));
    try { onConfirmed?.(true); } catch {}
    setSubmitting(false);
    navigation.goBack();
  }, [navigation, onConfirmed, submitting]);

  // ── Render ─────────────────────────────────────────────────────
  if (isTier2) return null;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP}>
          <ChevronLeft size={rs(24)} color={T.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Publish</Text>
        <View style={{ width: rs(24) }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fade }}>
          {step === 1 ? (
            // ── Step 1: soft ask ────────────────────────────────
            <View style={s.block}>
              <Globe size={rs(28)} color={themeObj.accent} />
              <Text style={s.kicker}>anonixx publisher</Text>
              <Text style={s.title}>
                Share this anonymously on our social pages?
              </Text>
              <Text style={s.sub}>
                It still says nothing about you. But more people will read it.
              </Text>

              {!!preview && (
                <View style={s.previewBox}>
                  <Text style={[s.previewText, { color: themeObj.accent }]} numberOfLines={4}>
                    "{preview}"
                  </Text>
                </View>
              )}

              <View style={s.actions}>
                <TouchableOpacity
                  style={[s.btnPrimary, { backgroundColor: themeObj.accent }]}
                  onPress={handleAskPublish}
                  activeOpacity={0.85}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={s.btnPrimaryText}>Yes — share it</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.btnGhost}
                  onPress={handleKeepPrivate}
                  activeOpacity={0.85}
                  hitSlop={HIT_SLOP}
                >
                  <Lock size={rs(14)} color={T.textSec} />
                  <Text style={s.btnGhostText}>No — keep private</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.footerNote}>
                Your identity never leaves Anonixx.
              </Text>
            </View>
          ) : (
            // ── Step 2: italic final confirmation ───────────────
            <View style={s.block}>
              <AlertTriangle size={rs(26)} color={T.warn} />
              <Text style={s.kicker}>last check</Text>
              <Text style={s.titleItalic}>
                Your words become public.
              </Text>
              <Text style={s.subItalic}>
                Screenshots. Reposts. Strangers you'll never meet.
                {'\n'}Once it's out, you can't pull it back.
              </Text>

              {isVoice && (
                <View style={s.voiceBox}>
                  <Volume2 size={rs(14)} color={T.warn} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.voiceTitle}>
                      People outside Anonixx will hear your voice.
                    </Text>
                    <Text style={s.voiceSub}>
                      Same tone. Same breath. Same silence between words.
                    </Text>
                  </View>
                </View>
              )}

              <View style={s.actions}>
                <TouchableOpacity
                  style={[
                    s.btnPrimary,
                    { backgroundColor: themeObj.accent },
                    submitting && { opacity: 0.6 },
                  ]}
                  onPress={handleConfirmPublish}
                  disabled={submitting}
                  activeOpacity={0.85}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={s.btnPrimaryText}>
                    {submitting ? 'Sealing it…' : 'Publish'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.btnGhost}
                  onPress={handleKeepPrivate}
                  activeOpacity={0.85}
                  hitSlop={HIT_SLOP}
                >
                  <Lock size={rs(14)} color={T.textSec} />
                  <Text style={s.btnGhostText}>Keep inside Anonixx</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.footerNote}>
                You can undo this only before you tap Publish.
              </Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.lg,
    color:         T.text,
    letterSpacing: 0.5,
  },

  scroll: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.lg,
    paddingBottom:     SPACING.xl,
  },

  block: {
    alignItems: 'flex-start',
  },

  kicker: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10),
    color:         T.textSec,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop:     rp(16),
    marginBottom:  rp(8),
  },
  title: {
    fontFamily:    'PlayfairDisplay-Bold',
    fontSize:      rf(26),
    color:         T.text,
    letterSpacing: 0.3,
    lineHeight:    rf(34),
  },
  titleItalic: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(28),
    color:         T.text,
    letterSpacing: 0.3,
    lineHeight:    rf(38),
  },
  sub: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(13),
    color:         T.textSec,
    letterSpacing: 0.3,
    lineHeight:    rf(20),
    marginTop:     rp(10),
  },
  subItalic: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(14),
    color:         T.textSec,
    letterSpacing: 0.3,
    lineHeight:    rf(22),
    marginTop:     rp(14),
  },

  previewBox: {
    alignSelf:         'stretch',
    marginTop:         SPACING.md,
    paddingHorizontal: rp(16),
    paddingVertical:   rp(14),
    borderLeftWidth:   rs(2),
    borderLeftColor:   'rgba(255,255,255,0.08)',
    backgroundColor:   'rgba(255,255,255,0.02)',
    borderRadius:      RADIUS.sm,
  },
  previewText: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(15),
    letterSpacing: 0.3,
    lineHeight:    rf(22),
  },

  voiceBox: {
    alignSelf:         'stretch',
    flexDirection:     'row',
    gap:               rp(10),
    alignItems:        'flex-start',
    marginTop:         SPACING.md,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
    backgroundColor:   'rgba(251,146,60,0.08)',
    borderColor:       'rgba(251,146,60,0.25)',
    borderWidth:       1,
    borderRadius:      RADIUS.md,
  },
  voiceTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(14),
    color:         T.warn,
    letterSpacing: 0.3,
    lineHeight:    rf(20),
  },
  voiceSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textSec,
    letterSpacing: 0.3,
    marginTop:     rp(4),
  },

  actions: {
    alignSelf:  'stretch',
    marginTop:  SPACING.lg,
    gap:        SPACING.sm,
  },
  btnPrimary: {
    height:          BUTTON_HEIGHT,
    borderRadius:    RADIUS.md,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: rs(4) },
    shadowOpacity:   0.35,
    shadowRadius:    rs(12),
    elevation:       6,
  },
  btnPrimaryText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.md,
    color:         '#fff',
    letterSpacing: 0.5,
  },
  btnGhost: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               rp(8),
    height:            BUTTON_HEIGHT,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
    backgroundColor:   'transparent',
  },
  btnGhostText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      FONT.sm,
    color:         T.textSec,
    letterSpacing: 0.5,
  },

  footerNote: {
    alignSelf:     'center',
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textMute,
    letterSpacing: 0.5,
    marginTop:     SPACING.md,
    textAlign:     'center',
  },
});
