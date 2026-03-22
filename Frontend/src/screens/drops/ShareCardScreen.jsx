/**
 * ShareCardScreen — drop a confession.
 * The card IS the writing surface. Auth token read from AsyncStorage.
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Keyboard, Platform, Dimensions,
  KeyboardAvoidingView, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';

// ─── Theme ────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  primary:       '#FF634A',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  textMuted:     '#4a4f62',
  border:        'rgba(255,255,255,0.06)',
};

const SCREEN_W = Dimensions.get('window').width;
const MAX_CHARS = 500;

// ─── Confession Card ──────────────────────────────────────────
const ConfessionCard = React.memo(({ text, setText, captureRef, inputRef }) => {
  const cardWidth = SCREEN_W - SPACING.md * 2;
  const remaining = MAX_CHARS - text.length;
  const warnColor = remaining <= 40
    ? (remaining <= 15 ? '#ef4444' : '#FB923C')
    : T.textMuted;

  return (
    <ViewShot
      ref={captureRef}
      options={{ format: 'png', quality: 1.0 }}
    >
      <View style={[card.wrap, { width: cardWidth }]}>

        {/* Brand row */}
        <View style={card.brandRow}>
          <Text style={card.brandName}>anonixx</Text>
          <View style={card.brandSepDot} />
          <Text style={card.brandTag}>drop</Text>
        </View>

        <View style={card.divider} />

        {/* Confession input */}
        <TextInput
          ref={inputRef}
          style={card.input}
          value={text}
          onChangeText={setText}
          placeholder="say what you've been holding in…"
          placeholderTextColor="rgba(154,154,163,0.3)"
          multiline
          maxLength={MAX_CHARS}
          textAlignVertical="top"
          autoCorrect
          autoCapitalize="sentences"
          scrollEnabled={false}
        />

        <View style={card.divider} />

        {/* Footer */}
        <View style={card.footerRow}>
          <Text style={card.anonTag}>— Anonymous</Text>
          <Text style={[card.remaining, { color: warnColor }]}>{remaining}</Text>
        </View>

        {/* Watermark */}
        <Text style={card.watermark}>anonixx.app</Text>

      </View>
    </ViewShot>
  );
});

// ─── Screen ───────────────────────────────────────────────────
export default function ShareCardScreen({ navigation }) {
  const { showToast } = useToast();
  const captureRef    = useRef(null);
  const inputRef      = useRef(null);

  const [text,      setText]      = useState('');
  const [loading,   setLoading]   = useState(false);
  const [dropId,    setDropId]    = useState(null);
  const [imageUri,  setImageUri]  = useState(null);

  // Step 1: Post the drop and capture the card image
  const handleDrop = useCallback(async () => {
    if (!text.trim()) {
      showToast({ type: 'warning', message: 'Write your confession first.' });
      return;
    }

    setLoading(true);
    try {
      // AuthContext does not expose token — read from AsyncStorage directly
      const token = await AsyncStorage.getItem('token');

      const res = await fetch(`${API_BASE_URL}/api/v1/drops`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ confession: text.trim(), category: 'love' }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      const id   = data?.id || data?._id || data?.drop_id;
      if (!id) throw new Error('No drop ID returned from server.');

      // Capture card image (before sharing, for "Save image" option)
      Keyboard.dismiss();
      inputRef.current?.blur();
      await new Promise(r => setTimeout(r, 160));
      const uri = await captureRef.current.capture();

      setDropId(id);
      setImageUri(uri);

      // Step 2: Share as a tappable HTTPS link.
      // https:// URLs are auto-linked in every messaging app (WhatsApp, iMessage, Telegram…).
      // The /open endpoint redirects to anonixx://drop/<id> so the app opens directly.
      const shareUrl = `${API_BASE_URL}/api/v1/drops/${id}/open`;
      await Share.share({
        message: Platform.OS === 'android'
          ? `I dropped a confession on Anonixx — tap to open:\n${shareUrl}`
          : `I dropped a confession on Anonixx`,
        url: Platform.OS === 'ios' ? shareUrl : undefined,
        title: 'Anonixx Drop',
      });

      showToast({ type: 'success', title: 'Dropped!', message: 'Your card is live.' });

    } catch (err) {
      // Share.share throws if user cancels — ignore cancel errors
      if (err?.message?.includes('cancel') || err?.message?.includes('dismiss')) return;
      showToast({ type: 'error', message: err.message || 'Could not create your drop. Try again.' });
    } finally {
      setLoading(false);
    }
  }, [text, showToast]);

  // Optional: share the card image separately after drop is created
  const handleShareImage = useCallback(async () => {
    if (!imageUri) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        showToast({ type: 'error', message: 'Sharing not available on this device.' });
        return;
      }
      await Sharing.shareAsync(imageUri, {
        mimeType:    'image/png',
        UTI:         'public.png',
        dialogTitle: 'Share card image',
      });
    } catch {
      showToast({ type: 'error', message: 'Could not share image.' });
    }
  }, [imageUri, showToast]);

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
          <Text style={styles.headerTitle}>Drop</Text>
          <TouchableOpacity onPress={() => navigation.navigate('DropsInbox')} hitSlop={HIT_SLOP}>
            <Text style={styles.headerAction}>My Drops</Text>
          </TouchableOpacity>
        </View>

        {/* Body */}
        <View style={styles.body}>
          <View style={styles.cardArea}>
            <ConfessionCard
              text={text}
              setText={setText}
              captureRef={captureRef}
              inputRef={inputRef}

            />
            <Text style={styles.hint}>
              tap the card to write · what you say here, only you know
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.dropBtn, (!text.trim() || loading) && styles.dropBtnDisabled]}
              onPress={handleDrop}
              disabled={!text.trim() || loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.dropBtnText}>Drop It  ↗</Text>
              }
            </TouchableOpacity>

            {/* After drop is created, offer sharing the card image too */}
            {imageUri && !loading && (
              <TouchableOpacity
                style={styles.imageShareBtn}
                onPress={handleShareImage}
                activeOpacity={0.75}
              >
                <Text style={styles.imageShareBtnText}>Share Card Image</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Card Styles ──────────────────────────────────────────────
const card = StyleSheet.create({
  wrap: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.08)',
    borderLeftWidth: 1,
    borderLeftColor: T.primary,
    paddingVertical:   rp(20),
    paddingHorizontal: rp(20),
    paddingLeft:       rp(22),
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: rs(8) },
    shadowOpacity:   0.4,
    shadowRadius:    rs(24),
    elevation:       8,
  },
  brandRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            rp(6),
    marginBottom:   rp(12),
  },
  brandName: {
    fontSize:      FONT.xs,
    fontWeight:    '700',
    color:         T.primary,
    letterSpacing: 1.2,
  },
  brandSepDot: {
    width:           rs(3),
    height:          rs(3),
    borderRadius:    rs(2),
    backgroundColor: T.textMuted,
  },
  brandTag: {
    fontSize:      FONT.xs,
    color:         T.textSecondary,
    letterSpacing: 0.4,
  },
  divider: {
    height:          1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom:    rp(12),
  },
  input: {
    fontSize:          rf(16),
    fontWeight:        '400',
    color:             T.text,
    lineHeight:        rf(26),
    letterSpacing:     0.15,
    minHeight:         rs(120),
    paddingVertical:   0,
    paddingHorizontal: 0,
    marginBottom:      rp(12),
  },
  footerRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   rp(8),
  },
  anonTag: {
    fontSize:  FONT.sm,
    color:     T.textSecondary,
    fontStyle: 'italic',
  },
  remaining: {
    fontSize:   rf(11),
    fontWeight: '600',
  },
  watermark: {
    fontSize:      rf(9),
    color:         T.textSecondary,
    letterSpacing: 0.3,
    marginTop:     rp(6),
    opacity:       0.5,
    textAlign:     'right',
  },
});

// ─── Screen Styles ────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: T.background,
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  backIcon: {
    fontSize:   rf(28),
    color:      T.text,
    lineHeight: rf(30),
  },
  headerTitle: {
    fontSize:      FONT.md,
    fontWeight:    '600',
    color:         T.text,
    letterSpacing: 0.3,
  },
  headerAction: {
    fontSize:   FONT.sm,
    color:      T.primary,
    fontWeight: '500',
  },
  body: {
    flex:           1,
    paddingBottom:  SPACING.lg,
    justifyContent: 'space-between',
  },
  cardArea: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.xl,
  },
  hint: {
    fontSize:      FONT.xs,
    color:         T.textMuted,
    textAlign:     'center',
    marginTop:     SPACING.sm,
    letterSpacing: 0.3,
  },
  actions: {
    paddingHorizontal: SPACING.md,
  },
  dropBtn: {
    backgroundColor: T.primary,
    borderRadius:    RADIUS.md,
    height:          BUTTON_HEIGHT,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     T.primary,
    shadowOffset:    { width: 0, height: rs(4) },
    shadowOpacity:   0.4,
    shadowRadius:    rs(14),
    elevation:       6,
  },
  dropBtnDisabled: {
    opacity: 0.38,
  },
  dropBtnText: {
    fontSize:      FONT.md,
    fontWeight:    '700',
    color:         '#fff',
    letterSpacing: 0.5,
  },
  imageShareBtn: {
    marginTop:         SPACING.sm,
    paddingVertical:   rp(12),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.10)',
    alignItems:        'center',
  },
  imageShareBtnText: {
    fontSize:   FONT.sm,
    color:      T.textSecondary,
    fontWeight: '500',
  },
});
