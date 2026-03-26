/**
 * ShareCardScreen — drop a confession.
 * The card IS the writing surface. Auth token read from AsyncStorage.
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Keyboard, Dimensions,
  KeyboardAvoidingView, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { useDispatch } from 'react-redux';
import { rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { awardMilestone } from '../../store/slices/coinsSlice';

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
const MAX_CHARS = 200;
const CARD_W = SCREEN_W - SPACING.md * 2;

// ─── Confession Card ──────────────────────────────────────────
const ConfessionCard = React.memo(({ text, setText, captureRef, inputRef, readOnly, shareUrl }) => {
  const remaining = MAX_CHARS - text.length;
  const warnColor = remaining <= 30
    ? (remaining <= 10 ? '#ef4444' : '#FB923C')
    : T.textMuted;

  return (
    <ViewShot
      ref={captureRef}
      options={{ format: 'png', quality: 1.0 }}
    >
      <View style={[card.wrap, { width: CARD_W }]}>

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
          onChangeText={readOnly ? undefined : setText}
          placeholder="say what you've been holding in…"
          placeholderTextColor="rgba(154,154,163,0.3)"
          multiline
          maxLength={MAX_CHARS}
          textAlignVertical="top"
          autoCorrect
          autoCapitalize="sentences"
          scrollEnabled={false}
          editable={!readOnly}
        />

        <View style={card.divider} />

        {/* Footer */}
        <View style={card.footerRow}>
          <Text style={card.anonTag}>— Anonymous</Text>
          {!readOnly && (
            <Text style={[card.remaining, { color: warnColor }]}>{remaining}</Text>
          )}
        </View>

        {/* Share URL baked into the image so the recipient can tap/open it */}
        {shareUrl ? (
          <Text style={card.shareUrl}>{shareUrl}</Text>
        ) : (
          <Text style={card.watermark}>anonixx.app</Text>
        )}

      </View>
    </ViewShot>
  );
});

// ─── Screen ───────────────────────────────────────────────────
export default function ShareCardScreen({ navigation }) {
  const { showToast } = useToast();
  const dispatch      = useDispatch();
  const captureRef    = useRef(null);
  const inputRef      = useRef(null);

  const [text,     setText]     = useState('');
  const [loading,  setLoading]  = useState(false);
  const [dropId,   setDropId]   = useState(null);
  const [imageUri, setImageUri] = useState(null);

  // Primary share: styled text that looks like the card + tappable URL.
  // WhatsApp renders *bold*, _italic_, and URLs as clickable links — works on every device.
  const shareText = useCallback(async (id, confession) => {
    const shareUrl = `${API_BASE_URL}/api/v1/drops/${id}/open`;
    const body = `❤️‍🔥 *anonixx.drop*\n\n_"${confession}"_\n\n*someone just confessed this. anonymously.*\n*who is it? unlock them →* ${shareUrl}`;
    try {
      const { Share } = require('react-native');
      await Share.share(
        Platform.OS === 'ios' ? { message: body, url: shareUrl } : { message: body },
        { dialogTitle: 'Share your drop' },
      );
    } catch (err) {
      if (err?.message?.includes('cancel') || err?.message?.includes('dismiss')) return;
      showToast({ type: 'error', message: 'Could not share.' });
    }
  }, [showToast]);

  // Secondary share: the visual card image (no clickable link, but looks beautiful).
  const shareImage = useCallback(async () => {
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) return;
      await new Promise(r => setTimeout(r, 80));
      const uri = await captureRef.current.capture();
      setImageUri(uri);
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share card image',
      });
    } catch (err) {
      if (err?.message?.includes('cancel') || err?.message?.includes('dismiss')) return;
      showToast({ type: 'error', message: 'Could not share image.' });
    }
  }, [showToast, captureRef]);

  // Post drop → capture card → upload image → patch drop → share link
  const handleDrop = useCallback(async () => {
    if (!text.trim()) {
      showToast({ type: 'warning', message: 'Write your confession first.' });
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');

      // 1. Create the drop
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

      Keyboard.dismiss();
      inputRef.current?.blur();
      setDropId(id);

      // Share styled text — confession readable + URL clickable in WhatsApp
      await shareText(id, text.trim());

      showToast({ type: 'success', title: 'Dropped!', message: 'Your card is live. Share it anywhere.' });
      dispatch(awardMilestone('first_drop'));

    } catch (err) {
      if (err?.message?.includes('cancel') || err?.message?.includes('dismiss')) return;
      showToast({ type: 'error', message: err.message || 'Could not create your drop. Try again.' });
    } finally {
      setLoading(false);
    }
  }, [text, showToast, shareText]);

  const handleShareAgain = useCallback(() => {
    if (dropId) shareText(dropId, text.trim());
  }, [dropId, text, shareText]);

  const dropped = !!dropId;

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

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Card */}
          <TouchableOpacity
            activeOpacity={dropped ? 0.85 : 1}
            onPress={dropped ? handleShareAgain : undefined}
            style={styles.cardWrap}
          >
            <ConfessionCard
              text={text}
              setText={setText}
              captureRef={captureRef}
              inputRef={inputRef}
              readOnly={dropped}
              shareUrl={dropped ? `${API_BASE_URL}/api/v1/drops/${dropId}/open` : null}
            />
            {dropped && (
              <View style={styles.tapOverlay}>
                <Text style={styles.tapLabel}>tap to share again  ↗</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.hint}>
            {dropped
              ? 'Your drop is live · share it anywhere'
              : 'tap the card to write · what you say here, only you know'}
          </Text>

          {/* Actions immediately after card */}
          <View style={styles.actions}>
            {!dropped ? (
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
            ) : (
              <>
                <TouchableOpacity
                  style={styles.dropBtn}
                  onPress={handleShareAgain}
                  activeOpacity={0.85}
                >
                  <Text style={styles.dropBtnText}>Share Again  ↗</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.imageShareBtn}
                  onPress={shareImage}
                  activeOpacity={0.75}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={styles.imageShareBtnText}>Share Card Image</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.copyLinkBtn}
                  onPress={async () => {
                    await Clipboard.setStringAsync(`${API_BASE_URL}/api/v1/drops/${dropId}/open`);
                    showToast({ type: 'success', message: 'Link copied.' });
                  }}
                  activeOpacity={0.75}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={styles.copyLinkText}>Copy Link</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
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
  shareUrl: {
    fontSize:      rf(9),
    color:         T.primary,
    marginTop:     rp(8),
    letterSpacing: 0.2,
    textAlign:     'center',
    opacity:       0.85,
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
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.xl,
    paddingBottom:     SPACING.lg,
  },
  cardWrap: {
    position: 'relative',
  },
  tapOverlay: {
    position:        'absolute',
    bottom:          rp(12),
    right:           rp(16),
    backgroundColor: 'rgba(11,15,24,0.72)',
    borderRadius:    RADIUS.sm,
    paddingVertical:   rp(4),
    paddingHorizontal: rp(10),
  },
  tapLabel: {
    fontSize:   FONT.xs,
    color:      T.primary,
    fontWeight: '600',
  },
  hint: {
    fontSize:      FONT.xs,
    color:         T.textMuted,
    textAlign:     'center',
    marginTop:     SPACING.sm,
    marginBottom:  SPACING.md,
    letterSpacing: 0.3,
  },
  actions: {
    // sits directly below hint — no flex push
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
  copyLinkBtn: {
    marginTop:  SPACING.sm,
    alignItems: 'center',
    paddingVertical: rp(10),
  },
  copyLinkText: {
    fontSize:   FONT.sm,
    color:      T.textMuted,
    fontWeight: '500',
  },
});
