/**
 * InspiredDropSheet
 *
 * Bottom sheet that appears when a user taps the Drop button on a feed card.
 * Two paths:
 *   1. Text-only  — type and submit directly from the sheet
 *   2. Add media  — escalates to DropsComposeScreen with text pre-filled
 *
 * Props
 *   visible          bool
 *   post             { id, content, anonymous_name } — the triggering post
 *   onClose          () => void
 *   navigation       React Navigation prop (passed from CalmFeedScreen)
 */

import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Animated, Dimensions, KeyboardAvoidingView, Modal, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity,
  TouchableWithoutFeedback, View, ActivityIndicator,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT  = SCREEN_HEIGHT * 0.70;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, Flame, Sparkles, X } from 'lucide-react-native';
import { FONT, HIT_SLOP, RADIUS, rf, rp, rs, SPACING } from '../../utils/responsive';
import { useToast } from '../ui/Toast';
import { API_BASE_URL } from '../../config/api';

// ─── Theme ────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  surfaceAlt:    '#1a1f2e',
  surfaceRaised: '#1e2436',
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.10)',
  primaryBorder: 'rgba(255,99,74,0.22)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  textMuted:     '#4a5068',
  border:        'rgba(255,255,255,0.06)',
  borderStrong:  'rgba(255,255,255,0.10)',
  chip:          'rgba(255,99,74,0.12)',
};

const MAX_CHARS = 400;

// Compact mode list for the sheet (same 3, shorter copy)
const SHEET_REFINE_MODES = [
  { id: 'holding_back', label: "say it fully" },
  { id: 'distill',      label: "to the heart" },
  { id: 'find_words',   label: "find the words" },
];

export default function InspiredDropSheet({ visible, post, onClose, navigation }) {
  const insets        = useSafeAreaInsets();
  const { showToast } = useToast();

  const [text,        setText]        = useState('');
  const [linked,      setLinked]      = useState(true);   // "inspired by" chip
  const [submitting,  setSubmitting]  = useState(false);

  // ── AI quick-refine ──────────────────────────────────────────
  const [aiRefining,   setAiRefining]   = useState(false);
  const [aiRefined,    setAiRefined]    = useState(false);
  const [aiRefineMode, setAiRefineMode] = useState(null);
  const [originalText, setOriginalText] = useState('');

  // Slide-up animation
  const slideAnim   = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setText('');
      setLinked(true);
      setSubmitting(false);
      setAiRefining(false);
      setAiRefined(false);
      setAiRefineMode(null);
      setOriginalText('');
      Animated.parallel([
        Animated.spring(slideAnim,    { toValue: 1, friction: 20, tension: 180, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim,    { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim,    { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(onClose);
  }, [onClose]);

  // ── AI quick-refine ──────────────────────────────────────────
  const handleRefineQuick = useCallback(async (mode) => {
    if (!text.trim() || aiRefining) return;
    setAiRefineMode(mode);
    setAiRefining(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/drops/refine`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ confession: text.trim(), mode }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!data?.refined) throw new Error();
      setOriginalText(text);
      setText(data.refined);
      setAiRefined(true);
    } catch {
      showToast({ type: 'warning', message: 'Refinement unavailable. Your words are perfect.' });
      setAiRefineMode(null);
    } finally {
      setAiRefining(false);
    }
  }, [text, aiRefining, showToast]);

  // ── Submit text-only drop straight from the sheet ─────────
  const handleDrop = useCallback(async () => {
    const confession = text.trim();
    if (!confession) {
      showToast({ type: 'warning', title: 'Say something', message: 'Your drop needs some words.' });
      return;
    }
    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        showToast({ type: 'info', message: 'Sign in to drop a confession.' });
        setSubmitting(false);
        return;
      }
      const body = {
        confession,
        category:            'love',
        inspired_by_post_id: linked && post?.id ? post.id : null,
        ...(aiRefined && aiRefineMode ? { ai_refined: true, ai_refined_mode: aiRefineMode } : {}),
      };
      const res  = await fetch(`${API_BASE_URL}/api/v1/drops`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          showToast({ type: 'warning', title: "Daily limit hit", message: data.detail || 'Come back tomorrow.' });
        } else {
          showToast({ type: 'error', message: data.detail || 'Could not post your drop.' });
        }
        return;
      }
      showToast({ type: 'success', title: 'Dropped 🔥', message: 'Your confession is out there.' });
      dismiss();
    } catch {
      showToast({ type: 'error', message: 'Connection error. Try again.' });
    } finally {
      setSubmitting(false);
    }
  }, [text, linked, post, dismiss, showToast]);

  // ── Escalate to full DropsComposeScreen ───────────────────
  const handleAddMedia = useCallback(() => {
    dismiss();
    // Brief delay so the sheet closes before the new screen opens
    setTimeout(() => {
      navigation.navigate('Connect', {
        screen: 'DropsCompose',
        params: {
          initialText:         text.trim(),
          inspiredByPostId:    linked && post?.id ? post.id : null,
        },
      });
    }, 240);
  }, [text, linked, post, navigation, dismiss]);

  if (!visible && slideAnim._value === 0) return null;

  const translateY = slideAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [SHEET_HEIGHT, 0],
  });

  const confessionPreview = post?.content
    ? post.content.length > 110
      ? post.content.slice(0, 110).trimEnd() + '…'
      : post.content
    : '';

  const charsLeft = MAX_CHARS - text.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Backdrop */}
        <TouchableWithoutFeedback onPress={dismiss}>
          <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]} />
        </TouchableWithoutFeedback>

        {/* Sheet — 70% of screen height */}
        <Animated.View
          style={[
            styles.sheet,
            { height: SHEET_HEIGHT, paddingBottom: insets.bottom + rp(16), transform: [{ translateY }] },
          ]}
        >
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTitleRow}>
              <Feather size={rs(16)} color={T.textSecondary} strokeWidth={1.8} />
              <Text style={styles.sheetTitle}>say something back</Text>
            </View>
            <TouchableOpacity onPress={dismiss} hitSlop={HIT_SLOP} style={styles.closeBtn}>
              <X size={rs(18)} color={T.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Original confession context */}
          {confessionPreview ? (
            <View style={styles.contextCard}>
              <Text style={styles.contextLabel}>responding to</Text>
              <Text style={styles.contextText}>"{confessionPreview}"</Text>
            </View>
          ) : null}

          {/* Inspired-by chip */}
          {post?.id && (
            <TouchableOpacity
              style={[styles.chip, !linked && styles.chipOff]}
              onPress={() => setLinked(v => !v)}
              activeOpacity={0.75}
              hitSlop={HIT_SLOP}
            >
              <View style={[styles.chipDot, !linked && styles.chipDotOff]} />
              <Text style={[styles.chipText, !linked && styles.chipTextOff]}>
                link to this confession
              </Text>
              {linked && (
                <TouchableOpacity
                  onPress={() => setLinked(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={rs(11)} color={T.primary} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}

          {/* AI quick-refine — appears once there's something to work with */}
          {text.length > 15 && (
            <View style={styles.refineRow}>
              <Sparkles size={rs(12)} color={aiRefined ? T.primary : T.textMuted} />
              <Text style={[styles.refineRowLabel, aiRefined && { color: T.primary }]}>
                {aiRefined ? '✦ refined' : '✦'}
              </Text>
              {aiRefined ? (
                <TouchableOpacity
                  style={styles.refineUndoChip}
                  onPress={() => { setAiRefined(false); setText(originalText); setAiRefineMode(null); }}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={styles.refineUndoText}>undo</Text>
                </TouchableOpacity>
              ) : (
                SHEET_REFINE_MODES.map(({ id, label }) => (
                  <TouchableOpacity
                    key={id}
                    style={[styles.refineChip, aiRefineMode === id && styles.refineChipActive]}
                    onPress={() => handleRefineQuick(id)}
                    disabled={aiRefining}
                    hitSlop={HIT_SLOP}
                    activeOpacity={0.75}
                  >
                    {aiRefining && aiRefineMode === id ? (
                      <ActivityIndicator size="small" color={T.primary} style={{ width: rs(40) }} />
                    ) : (
                      <Text style={[styles.refineChipText, aiRefineMode === id && { color: T.primary }]}>
                        {label}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* Text input */}
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="say the thing you've been holding…"
              placeholderTextColor={T.textMuted}
              multiline
              maxLength={MAX_CHARS}
              value={text}
              onChangeText={setText}
              autoFocus
              textAlignVertical="top"
              selectionColor={T.primary}
            />
            <Text style={[styles.charCount, charsLeft < 40 && styles.charCountWarn]}>
              {charsLeft}
            </Text>
          </View>

          {/* Consent line */}
          <Text style={styles.consentNote}>
            Your drop goes to the marketplace — others can pay to connect with you.
          </Text>

          {/* Action row */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.mediaBtn}
              onPress={handleAddMedia}
              hitSlop={HIT_SLOP}
              activeOpacity={0.75}
            >
              <Text style={styles.mediaBtnText}>add media →</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dropBtn, (!text.trim() || submitting) && styles.dropBtnDisabled]}
              onPress={handleDrop}
              disabled={!text.trim() || submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Flame size={rs(15)} color="#fff" fill="#fff" />
                  <Text style={styles.dropBtnText}>drop it</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex:    { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },

  sheet: {
    position:             'absolute',
    bottom:               0,
    left:                 0,
    right:                0,
    backgroundColor:      T.surface,
    borderTopLeftRadius:  RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal:    SPACING.md,
    paddingTop:           rp(10),
    borderTopWidth:       1,
    borderColor:          T.borderStrong,
    // flex layout lets inputWrap grow to fill the space
    flexDirection:        'column',
  },

  handle: {
    alignSelf:       'center',
    width:           rs(36),
    height:          rs(4),
    borderRadius:    rs(2),
    backgroundColor: T.border,
    marginBottom:    rp(14),
  },

  sheetHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   rp(14),
  },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  sheetTitle:    { fontSize: FONT.md, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  closeBtn:      {
    width: rs(30), height: rs(30),
    alignItems: 'center', justifyContent: 'center',
    borderRadius: rs(15), backgroundColor: 'rgba(255,255,255,0.05)',
  },

  // Original confession context
  contextCard: {
    backgroundColor: T.surfaceAlt,
    borderRadius:    RADIUS.md,
    padding:         rp(12),
    marginBottom:    rp(10),
    borderLeftWidth: 2,
    borderLeftColor: T.primaryBorder,
  },
  contextLabel: {
    fontSize:      rf(10),
    fontWeight:    '700',
    color:         T.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom:  rp(4),
  },
  contextText: {
    fontSize:    FONT.sm,
    color:       T.textSecondary,
    fontStyle:   'italic',
    lineHeight:  rf(20),
  },

  // Inspired-by chip
  chip: {
    alignSelf:       'flex-start',
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(5),
    backgroundColor: T.chip,
    borderRadius:    RADIUS.full,
    paddingHorizontal: rp(10),
    paddingVertical:   rp(5),
    borderWidth:     1,
    borderColor:     T.primaryBorder,
    marginBottom:    rp(12),
  },
  chipOff:      { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: T.border },
  chipDot:      { width: rs(6), height: rs(6), borderRadius: rs(3), backgroundColor: T.primary },
  chipDotOff:   { backgroundColor: T.textMuted },
  chipText:     { fontSize: rf(11), fontWeight: '600', color: T.primary },
  chipTextOff:  { color: T.textMuted },

  // AI quick-refine row
  refineRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            rp(6),
    flexWrap:       'wrap',
    marginBottom:   rp(8),
  },
  refineRowLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10),
    color:         T.textMuted,
    letterSpacing: 0.5,
  },
  refineChip: {
    paddingHorizontal: rp(10),
    paddingVertical:   rp(4),
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    borderColor:       T.border,
    backgroundColor:   'rgba(255,255,255,0.03)',
  },
  refineChipActive: {
    borderColor:     T.primaryBorder,
    backgroundColor: T.primaryDim,
  },
  refineChipText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(11),
    color:         T.textSecondary,
    letterSpacing: 0.2,
  },
  refineUndoChip: {
    paddingHorizontal: rp(8),
    paddingVertical:   rp(3),
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    borderColor:       'rgba(255,99,74,0.3)',
    backgroundColor:   'rgba(255,99,74,0.08)',
  },
  refineUndoText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(10),
    color:         T.primary,
    letterSpacing: 0.3,
  },

  // Input — flex: 1 makes it fill available space inside the 70% sheet
  inputWrap: {
    flex:            1,
    backgroundColor: T.surfaceAlt,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     T.border,
    padding:         rp(14),
    marginBottom:    rp(12),
  },
  input: {
    fontSize:   FONT.md,
    color:      T.text,
    lineHeight: rf(24),
    flex:       1,
    fontFamily: 'PlayfairDisplay-Regular',
  },
  charCount:     { fontSize: rf(11), color: T.textMuted, alignSelf: 'flex-end', marginTop: rp(6) },
  charCountWarn: { color: T.primary },

  // Consent
  consentNote: {
    fontSize:      rf(11),
    fontFamily:    'DMSans-Italic',
    color:         T.textMuted,
    textAlign:     'center',
    marginBottom:  rp(10),
    lineHeight:    rf(16),
    letterSpacing: 0.1,
  },

  // Actions
  actionRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  mediaBtn: {
    paddingVertical:   rp(10),
    paddingHorizontal: rp(4),
  },
  mediaBtnText: {
    fontSize:   FONT.sm,
    fontWeight: '600',
    color:      T.textSecondary,
  },
  dropBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(6),
    backgroundColor:   T.primary,
    paddingHorizontal: rp(22),
    paddingVertical:   rp(12),
    borderRadius:      RADIUS.md,
    shadowColor:       T.primary,
    shadowOffset:      { width: 0, height: rs(4) },
    shadowOpacity:     0.45,
    shadowRadius:      rs(10),
    elevation:         6,
  },
  dropBtnDisabled: { opacity: 0.45, shadowOpacity: 0 },
  dropBtnText:     { fontSize: FONT.md, fontWeight: '700', color: '#fff' },
});
