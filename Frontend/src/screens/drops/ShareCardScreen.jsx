import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import StarryBackground from '../../components/common/StarryBackground';

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  primary:       '#FF634A',
  primaryDim:    'rgba(255, 99, 74, 0.15)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  border:        'rgba(255,255,255,0.06)',
  inputBg:       'rgba(255,255,255,0.04)',
};

const SCREEN_W = Dimensions.get('window').width;

// ─── Static data (module level) ───────────────────────────────────────────────
const PROMPTS = [
  'I wish someone knew…',
  'The thing I can\'t say out loud…',
  'I\'ve been carrying this alone…',
  'What I really need right now…',
  'Something I\'ve never admitted…',
  'If I could tell anyone…',
  'My honest truth is…',
  'I keep pretending that…',
];

const CARD_STYLES = [
  { id: 'midnight', bg: '#0b0f18', accent: '#FF634A', label: 'Midnight' },
  { id: 'dusk',     bg: '#150d1e', accent: '#C084FC', label: 'Dusk'     },
  { id: 'ocean',    bg: '#091419', accent: '#38BDF8', label: 'Ocean'    },
  { id: 'ember',    bg: '#160d05', accent: '#FB923C', label: 'Ember'    },
];

// ─── ConfessionCard — same component used for preview AND captured as image ───
const ConfessionCard = React.memo(({ text, prompt, cardStyle, captureRef }) => {
  const style = CARD_STYLES.find(s => s.id === cardStyle) || CARD_STYLES[0];
  const cardWidth = SCREEN_W - SPACING.md * 2;

  return (
    <ViewShot
      ref={captureRef}
      options={{ format: 'png', quality: 1.0 }}
      style={{ borderRadius: RADIUS.lg, overflow: 'hidden' }}
    >
      <StarryBackground />
      <View style={[cardStyles.card, { backgroundColor: style.bg, width: cardWidth }]}>
        {/* Top accent bar */}
        <View style={[cardStyles.accentBar, { backgroundColor: style.accent }]} />

        <View style={cardStyles.inner}>
          {/* Brand row */}
          <View style={cardStyles.brandRow}>
            <View style={[cardStyles.brandDot, { backgroundColor: style.accent }]} />
            <Text style={[cardStyles.brandName, { color: style.accent }]}>anonixx</Text>
            <Text style={cardStyles.brandTagline}>· anonymous confessions</Text>
          </View>

          {/* Divider */}
          <View style={[cardStyles.divider, { backgroundColor: style.accent + '22' }]} />

          {/* Prompt */}
          {!!prompt && (
            <Text style={[cardStyles.prompt, { color: style.accent + 'bb' }]}>
              {prompt}
            </Text>
          )}

          {/* The actual confession */}
          <Text
            style={[
              cardStyles.confessionText,
              !text && cardStyles.placeholderText,
            ]}
            numberOfLines={10}
          >
            {text || 'Your confession will appear here…'}
          </Text>

          {/* Footer */}
          <View style={cardStyles.footer}>
            <Text style={cardStyles.anonTag}>— Anonymous</Text>
            <View style={[cardStyles.ctaBadge, {
              borderColor: style.accent + '55',
              backgroundColor: style.accent + '15',
            }]}>
              <Text style={[cardStyles.ctaLabel, { color: style.accent }]}>
                Tap to respond ›
              </Text>
            </View>
          </View>

          {/* Watermark URL */}
          <Text style={cardStyles.watermark}>anonixx.app</Text>
        </View>
      </View>
    </ViewShot>
  );
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ShareCardScreen({ navigation }) {
  const { token }      = useAuth();
  const { showToast }  = useToast();
  const captureRef     = useRef(null);
  const scaleAnim      = useRef(new Animated.Value(1)).current;

  const [text, setText]               = useState('');
  const [prompt, setPrompt]           = useState('');
  const [cardStyle, setCardStyle]     = useState('midnight');
  const [loading, setLoading]         = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);

  // ── Press animation on card ──────────────────────────────────────────────────
  const onPressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.97, useNativeDriver: true, tension: 300, friction: 10,
    }).start();
  }, [scaleAnim]);

  const onPressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1, useNativeDriver: true, tension: 300, friction: 10,
    }).start();
  }, [scaleAnim]);

  // ── Prompt handlers ──────────────────────────────────────────────────────────
  const handleSelectPrompt = useCallback((p) => {
    setPrompt(p);
    setShowPrompts(false);
  }, []);

  const handleClearPrompt = useCallback(() => setPrompt(''), []);

  // ── Style handler ────────────────────────────────────────────────────────────
  const handleStyleSelect = useCallback((id) => setCardStyle(id), []);

  // ── Main action: create drop → capture card → share image + link ─────────────
  const handleDrop = useCallback(async () => {
    if (!text.trim()) {
      showToast({ type: 'warning', message: 'Write your confession first.' });
      return;
    }
    if (text.trim().length < 10) {
      showToast({ type: 'warning', message: 'Say a little more — at least 10 characters.' });
      return;
    }

    setLoading(true);
    try {
      // Step 1 — Create the drop on the server
      const res = await fetch(`${API_BASE_URL}/api/v1/drops`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          text:       text.trim(),
          prompt:     prompt || null,
          card_style: cardStyle,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || `Server error ${res.status}`);
      }

      const data   = await res.json();
      const dropId = data?.id || data?._id || data?.drop_id;
      if (!dropId) throw new Error('No drop ID returned from server.');

      // Step 2 — Capture the card preview as a PNG
      const imageUri = await captureRef.current.capture();

      // Step 3 — Verify sharing is available
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        showToast({ type: 'error', message: 'Sharing is not available on this device.' });
        return;
      }

      // Step 4 — Share the real card image
      // The image IS the card with the full confession.
      // Deep link goes in the message body so recipients can tap into Anonixx.
      const deepLink = `anonixx://drop/${dropId}`;

      await Sharing.shareAsync(imageUri, {
        mimeType:    'image/png',
        UTI:         'public.png',       // iOS
        dialogTitle: 'Share your confession',
        // Android shows this text alongside the image in the share sheet
        message:     `I left a confession on Anonixx. Tap to respond:\n${deepLink}`,
      });

      showToast({ type: 'success', title: 'Dropped!', message: 'Your card is live.' });

    } catch (err) {
      showToast({ type: 'error', message: 'Could not create your drop. Try again.' });
    } finally {
      setLoading(false);
    }
  }, [text, prompt, cardStyle, token, showToast]);

  // ── Char count color ─────────────────────────────────────────────────────────
  const charColor = useMemo(() => {
    if (text.length > 450) return '#ef4444';
    if (text.length > 350) return '#FB923C';
    return T.textSecondary;
  }, [text.length]);

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Drop a Confession</Text>
          <TouchableOpacity onPress={() => navigation.navigate('DropsInbox')} hitSlop={HIT_SLOP}>
            <Text style={styles.headerAction}>My Drops</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Card Preview ── */}
          <View style={styles.section}>
            <Text style={styles.label}>Your Card</Text>
            <Text style={styles.hint}>
              This exact card — with your real message — gets shared as an image.
              The caption includes a link to open Anonixx.
            </Text>

            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <Pressable
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                onPress={handleDrop}
                disabled={loading}
              >
                <ConfessionCard
                  text={text}
                  prompt={prompt}
                  cardStyle={cardStyle}
                  captureRef={captureRef}
                />
              </Pressable>
            </Animated.View>

            <Text style={styles.tapHint}>↑ Tap card or use the button below</Text>
          </View>

          {/* ── Card Style ── */}
          <View style={styles.section}>
            <Text style={styles.label}>Card Style</Text>
            <View style={styles.styleRow}>
              {CARD_STYLES.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => handleStyleSelect(s.id)}
                  hitSlop={HIT_SLOP}
                  style={[
                    styles.stylePill,
                    { borderColor: s.accent },
                    cardStyle === s.id && { backgroundColor: s.accent + '22' },
                  ]}
                >
                  <View style={[styles.styleDot, { backgroundColor: s.accent }]} />
                  <Text style={[
                    styles.stylePillLabel,
                    cardStyle === s.id && { color: s.accent },
                  ]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Prompt ── */}
          <View style={styles.section}>
            <View style={styles.row}>
              <Text style={styles.label}>Prompt</Text>
              {prompt
                ? <TouchableOpacity onPress={handleClearPrompt} hitSlop={HIT_SLOP}>
                    <Text style={styles.clearBtn}>Clear</Text>
                  </TouchableOpacity>
                : null}
            </View>

            {prompt ? (
              <View style={styles.activePrompt}>
                <Text style={styles.activePromptText}>{prompt}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.promptToggle}
                onPress={() => setShowPrompts(v => !v)}
                hitSlop={HIT_SLOP}
              >
                <Text style={styles.promptToggleText}>
                  {showPrompts ? 'Hide prompts ↑' : 'Pick a prompt (optional) ↓'}
                </Text>
              </TouchableOpacity>
            )}

            {showPrompts && !prompt && (
              <View style={styles.promptGrid}>
                {PROMPTS.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={styles.promptChip}
                    onPress={() => handleSelectPrompt(p)}
                    hitSlop={HIT_SLOP}
                  >
                    <Text style={styles.promptChipText}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* ── Confession Input ── */}
          <View style={styles.section}>
            <View style={styles.row}>
              <Text style={styles.label}>Your Confession</Text>
              <Text style={[styles.charCount, { color: charColor }]}>
                {text.length}/500
              </Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder={prompt || 'Say what you\'ve been holding in…'}
              placeholderTextColor={T.textSecondary}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
              textAlignVertical="top"
              autoCorrect
              autoCapitalize="sentences"
            />
          </View>

          {/* ── Drop It ── */}
          <TouchableOpacity
            style={[styles.dropBtn, loading && styles.dropBtnDisabled]}
            onPress={handleDrop}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Text style={styles.dropBtnText}>Drop It</Text>
                  <Text style={styles.dropBtnSub}>Shares your real card as an image</Text>
                </>
            }
          </TouchableOpacity>

          {/* ── How it works ── */}
          <View style={styles.howBox}>
            <Text style={styles.howTitle}>How it works</Text>
            {[
              'Write your confession — it appears on the card exactly.',
              'Tap Drop It → card saved, real image ready to share.',
              'Send the image anywhere — WhatsApp, Instagram, anywhere.',
              'They tap the link in the caption → opens Anonixx → your drop.',
              'Chat anonymously. Reveal only if you both want to.',
            ].map((step, i) => (
              <View key={i} style={styles.howRow}>
                <Text style={styles.howNum}>{i + 1}</Text>
                <Text style={styles.howText}>{step}</Text>
              </View>
            ))}
          </View>

          <View style={{ height: SPACING.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Card Styles ──────────────────────────────────────────────────────────────
const cardStyles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    minHeight: rs(240),
  },
  accentBar: {
    height: rs(4),
    width: '100%',
  },
  inner: {
    padding: SPACING.lg,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  brandDot: {
    width: rs(7),
    height: rs(7),
    borderRadius: rs(4),
    marginRight: SPACING.xs,
  },
  brandName: {
    fontSize: FONT.sm,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginRight: SPACING.xs,
  },
  brandTagline: {
    fontSize: FONT.xs,
    color: '#9A9AA3',
    letterSpacing: 0.3,
  },
  divider: {
    height: 1,
    marginBottom: SPACING.md,
  },
  prompt: {
    fontSize: FONT.xs,
    fontStyle: 'italic',
    marginBottom: SPACING.sm,
    lineHeight: rf(18),
  },
  confessionText: {
    fontSize: rf(17),
    fontWeight: '300',
    color: '#EAEAF0',
    lineHeight: rf(27),
    letterSpacing: 0.2,
    marginBottom: SPACING.lg,
  },
  placeholderText: {
    opacity: 0.3,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  anonTag: {
    fontSize: FONT.xs,
    color: '#9A9AA3',
    fontStyle: 'italic',
  },
  ctaBadge: {
    paddingHorizontal: rp(10),
    paddingVertical: rp(4),
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  ctaLabel: {
    fontSize: FONT.xs,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  watermark: {
    fontSize: rf(10),
    color: '#9A9AA3',
    opacity: 0.4,
    letterSpacing: 0.5,
    textAlign: 'right',
    marginTop: rp(2),
  },
});

// ─── Screen Styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: T.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  backIcon: {
    fontSize: rf(28),
    color: T.text,
    lineHeight: rf(30),
  },
  headerTitle: {
    fontSize: FONT.md,
    fontWeight: '600',
    color: T.text,
    letterSpacing: 0.2,
  },
  headerAction: {
    fontSize: FONT.sm,
    color: T.primary,
    fontWeight: '500',
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: FONT.xs,
    fontWeight: '600',
    color: T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  hint: {
    fontSize: FONT.xs,
    color: T.textSecondary,
    marginBottom: SPACING.sm,
    lineHeight: rf(18),
  },
  tapHint: {
    fontSize: FONT.xs,
    color: T.primary,
    opacity: 0.7,
    textAlign: 'center',
    marginTop: SPACING.xs,
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  styleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  stylePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: rp(6),
    borderRadius: RADIUS.full,
    borderWidth: 1,
    gap: SPACING.xs,
  },
  styleDot: {
    width: rs(8),
    height: rs(8),
    borderRadius: rs(4),
  },
  stylePillLabel: {
    fontSize: FONT.xs,
    color: T.textSecondary,
    fontWeight: '500',
  },
  promptToggle: {
    paddingVertical: rp(10),
    paddingHorizontal: SPACING.sm,
    backgroundColor: T.inputBg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: T.border,
    borderStyle: 'dashed',
  },
  promptToggleText: {
    fontSize: FONT.sm,
    color: T.textSecondary,
  },
  activePrompt: {
    paddingVertical: rp(10),
    paddingHorizontal: SPACING.sm,
    backgroundColor: T.primaryDim,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: T.primary + '44',
  },
  activePromptText: {
    fontSize: FONT.sm,
    color: T.primary,
    fontStyle: 'italic',
  },
  clearBtn: {
    fontSize: FONT.xs,
    color: T.primary,
    fontWeight: '500',
  },
  promptGrid: {
    marginTop: SPACING.sm,
    gap: SPACING.xs,
  },
  promptChip: {
    paddingVertical: rp(10),
    paddingHorizontal: SPACING.sm,
    backgroundColor: T.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: T.border,
  },
  promptChipText: {
    fontSize: FONT.sm,
    color: T.text,
    lineHeight: rf(20),
  },
  input: {
    backgroundColor: T.inputBg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: T.border,
    padding: SPACING.md,
    color: T.text,
    fontSize: FONT.md,
    lineHeight: rf(24),
    minHeight: rs(140),
  },
  charCount: {
    fontSize: FONT.xs,
  },
  dropBtn: {
    backgroundColor: T.primary,
    borderRadius: RADIUS.md,
    height: BUTTON_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    gap: rp(2),
  },
  dropBtnDisabled: { opacity: 0.6 },
  dropBtnText: {
    fontSize: FONT.md,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  dropBtnSub: {
    fontSize: FONT.xs,
    color: 'rgba(255,255,255,0.6)',
  },
  howBox: {
    backgroundColor: T.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: T.border,
    gap: SPACING.sm,
  },
  howTitle: {
    fontSize: FONT.xs,
    fontWeight: '600',
    color: T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.xs,
  },
  howRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  howNum: {
    fontSize: FONT.xs,
    fontWeight: '700',
    color: T.primary,
    width: rs(16),
  },
  howText: {
    fontSize: FONT.sm,
    color: T.textSecondary,
    flex: 1,
    lineHeight: rf(20),
  },
});
