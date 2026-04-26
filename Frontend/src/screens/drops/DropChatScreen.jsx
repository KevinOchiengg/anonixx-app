/**
 * DropChatScreen
 *
 * Anonymous chat for Drops connections. Includes reveal ceremony flow.
 *
 * Rebuilt to match DropsComposeScreen design language:
 *   • shared `T` palette
 *   • DropScreenHeader with anonymous name + reveal right-action
 *   • useToast (replaces Alert.alert)
 *   • responsive tokens (no hardcoded pixels)
 *   • PlayfairDisplay-Italic for anon names, reveal ceremony, confession banner
 *   • DMSans for chrome + message bodies
 *   • 320 ms entrance fade
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  Animated, Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Send, Sparkles, CheckCircle, Eye,
} from 'lucide-react-native';

import { T } from '../../utils/colorTokens';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP,
} from '../../utils/responsive';
import DropScreenHeader from '../../components/drops/DropScreenHeader';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';

const REVEAL_PRICE = 1.0;
const POLL_INTERVAL_MS = 8000;
const REVEAL_POLL_MS   = 5000;
const MAX_REVEAL_ATTEMPTS = 24;

// ─── Message bubble ────────────────────────────────────────────
const Bubble = React.memo(({ item }) => {
  const isOwn = item.is_own;
  return (
    <View style={[s.msgRow, isOwn && s.msgRowOwn]}>
      <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleTheir]}>
        <Text style={[s.bubbleText, isOwn && s.bubbleTextOwn]}>
          {item.content}
        </Text>
        <Text style={[s.bubbleTime, isOwn && s.bubbleTimeOwn]}>
          {item.time_ago}
        </Text>
      </View>
    </View>
  );
});

// ─── Empty chat ────────────────────────────────────────────────
const EmptyChat = React.memo(() => (
  <View style={s.emptyChat}>
    <Text style={s.emptyChatEmoji}>👋</Text>
    <Text style={s.emptyChatText}>
      Say hi — you're both anonymous. Break the ice.
    </Text>
  </View>
));

// ─── Main Screen ───────────────────────────────────────────────
export default function DropChatScreen({ route, navigation }) {
  const { connectionId } = route.params;
  const insets        = useSafeAreaInsets();
  const { showToast } = useToast();

  const [messages, setMessages]     = useState([]);
  const [connection, setConnection] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [text, setText]             = useState('');
  const [sending, setSending]       = useState(false);

  const [showRevealModal, setShowRevealModal] = useState(false);
  const [revealStep, setRevealStep]           = useState('idle'); // idle | phone | waiting | polling | done
  const [revealPhone, setRevealPhone]         = useState('');
  const [revealData, setRevealData]           = useState(null);

  const flatListRef  = useRef(null);
  const revealScale  = useRef(new Animated.Value(0)).current;
  const fadeAnim     = useRef(new Animated.Value(0)).current;
  const pollRef      = useRef(null);
  const revealPollRef = useRef(null);

  // ── Fetchers ──────────────────────────────────────────────
  const checkRevealStatus = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/drops/connections/${connectionId}/reveal/status`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        if (data.revealed) setRevealData(data);
      }
    } catch { /* silent */ }
  }, [connectionId]);

  const loadMessages = useCallback(async (silent = false) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/drops/connections/${connectionId}/messages`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
        setConnection(data.connection);
        if (data.connection?.is_revealed && !revealData) {
          checkRevealStatus();
        }
      } else if (!silent) {
        showToast({ type: 'error', message: "Couldn't load messages." });
      }
    } catch {
      if (!silent) {
        showToast({ type: 'error', message: 'Network error.' });
      }
    }
  }, [connectionId, revealData, checkRevealStatus, showToast]);

  // ── Initial load + polling ────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadMessages(false);
      setLoading(false);
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 320, useNativeDriver: true,
      }).start();
    })();

    pollRef.current = setInterval(() => loadMessages(true), POLL_INTERVAL_MS);
    return () => {
      clearInterval(pollRef.current);
      clearInterval(revealPollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Send ──────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content) return;
    setText('');
    setSending(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(
        `${API_BASE_URL}/api/v1/drops/connections/${connectionId}/message`,
        {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${token}`,
          },
          body: JSON.stringify({ content }),
        },
      );
      await loadMessages(true);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      showToast({ type: 'error', message: 'Failed to send. Try again.' });
    } finally {
      setSending(false);
    }
  }, [text, connectionId, loadMessages, showToast]);

  // ── Reveal flow ───────────────────────────────────────────
  const startRevealPolling = useCallback(() => {
    let attempts = 0;
    revealPollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > MAX_REVEAL_ATTEMPTS) {
        clearInterval(revealPollRef.current);
        setRevealStep('idle');
        showToast({ type: 'warning', message: 'Payment timed out. Try again.' });
        return;
      }
      try {
        const token = await AsyncStorage.getItem('token');
        const res   = await fetch(
          `${API_BASE_URL}/api/v1/drops/connections/${connectionId}/reveal/status`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json();
        if (data.revealed) {
          clearInterval(revealPollRef.current);
          setRevealData(data);
          setRevealStep('done');
          Animated.spring(revealScale, {
            toValue: 1, friction: 5, useNativeDriver: true,
          }).start();
        }
      } catch { /* keep polling */ }
    }, REVEAL_POLL_MS);
  }, [connectionId, revealScale, showToast]);

  const handleRevealMpesa = useCallback(async () => {
    if (!revealPhone.trim()) return;
    setRevealStep('waiting');
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/drops/connections/${connectionId}/reveal/mpesa`,
        {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${token}`,
          },
          body: JSON.stringify({ phone_number: revealPhone.trim() }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        setRevealStep('polling');
        startRevealPolling();
      } else {
        showToast({
          type:    'error',
          message: data.detail || 'Payment failed. Try again.',
        });
        setRevealStep('phone');
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong.' });
      setRevealStep('phone');
    }
  }, [revealPhone, connectionId, startRevealPolling, showToast]);

  // ── Helpers ───────────────────────────────────────────────
  const renderMessage = useCallback(({ item }) => <Bubble item={item} />, []);
  const keyExtractor  = useCallback((item) => item.id, []);

  const handleOpenReveal = useCallback(() => {
    setRevealStep('idle');
    setShowRevealModal(true);
  }, []);

  // Header right: reveal pill / revealed tag
  const HeaderRight = useMemo(() => {
    if (!connection) return null;
    if (connection.is_revealed) {
      return (
        <View style={s.revealedTag}>
          <CheckCircle size={rs(13)} color={T.success} strokeWidth={2} />
          <Text style={s.revealedTagText}>Revealed</Text>
        </View>
      );
    }
    return (
      <TouchableOpacity
        style={s.revealBtn}
        onPress={handleOpenReveal}
        hitSlop={HIT_SLOP}
        activeOpacity={0.85}
      >
        <Sparkles size={rs(14)} color={T.primary} strokeWidth={2} />
        <Text style={s.revealBtnText}>Reveal</Text>
      </TouchableOpacity>
    );
  }, [connection, handleOpenReveal]);

  const headerTitle = useMemo(() => {
    if (!connection) return 'Anonymous';
    if (revealData?.revealed_name) {
      return `${revealData.revealed_name}`;
    }
    return connection.other_anonymous_name || 'Anonymous';
  }, [connection, revealData]);

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={[s.safe, s.centered]} edges={['top', 'left', 'right']}>
        <ActivityIndicator color={T.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <DropScreenHeader
        title={headerTitle}
        navigation={navigation}
        right={HeaderRight}
      />

      {/* Was-anonymous-as subtitle when revealed */}
      {revealData?.revealed_name && connection?.other_anonymous_name ? (
        <Text style={s.wasAnon}>
          was <Text style={{ color: T.primary }}>{connection.other_anonymous_name}</Text>
        </Text>
      ) : null}

      {/* Confession banner */}
      {connection?.confession ? (
        <View style={s.confessionBanner}>
          <Text style={s.confessionBannerKicker}>THEIR CONFESSION</Text>
          <Text style={s.confessionBannerText} numberOfLines={2}>
            "{connection.confession}"
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
          {messages.length === 0 ? (
            <EmptyChat />
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={keyExtractor}
              renderItem={renderMessage}
              contentContainerStyle={s.messageList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews
              initialNumToRender={14}
              maxToRenderPerBatch={10}
              windowSize={10}
              onContentSizeChange={() =>
                flatListRef.current?.scrollToEnd({ animated: false })
              }
            />
          )}
        </Animated.View>

        {/* Input */}
        <View style={[s.inputBar, { paddingBottom: insets.bottom + rp(8) }]}>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder="Say something…"
            placeholderTextColor={T.textMute}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
            hitSlop={HIT_SLOP}
            activeOpacity={0.85}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Send size={rs(18)} color="#fff" strokeWidth={2.2} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Reveal modal ── */}
      <Modal
        visible={showRevealModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRevealModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            {revealStep === 'done' ? (
              <Animated.View style={[s.revealSuccess, { transform: [{ scale: revealScale }] }]}>
                <Text style={s.revealSuccessEmoji}>🎭</Text>
                <Text style={s.revealSuccessKicker}>MYSTERY SOLVED</Text>
                <Text style={s.revealSuccessName}>{revealData?.revealed_name}</Text>
                <Text style={s.revealSuccessSub}>
                  <Text style={{ fontFamily: 'PlayfairDisplay-Italic' }}>
                    {connection?.other_anonymous_name}
                  </Text>
                  {' was '}
                  <Text style={{ color: T.primary, fontFamily: 'DMSans-Bold' }}>
                    {revealData?.revealed_name}
                  </Text>
                  {' all along.'}
                </Text>
                <TouchableOpacity
                  style={s.revealDoneBtn}
                  onPress={() => setShowRevealModal(false)}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.9}
                >
                  <Text style={s.revealDoneBtnText}>Close</Text>
                </TouchableOpacity>
              </Animated.View>

            ) : revealStep === 'polling' || revealStep === 'waiting' ? (
              <View style={s.revealWaiting}>
                <ActivityIndicator color={T.primary} size="large" />
                <Text style={s.revealWaitTitle}>
                  {revealStep === 'waiting'
                    ? 'Sending STK push…'
                    : 'Waiting for payment…'}
                </Text>
                <Text style={s.revealWaitSub}>
                  Enter your M-Pesa PIN on your phone
                </Text>
              </View>

            ) : (
              <>
                <View style={s.modalHandle} />
                <Text style={s.modalTitle}>Reveal Identity</Text>
                <Text style={s.modalSub}>
                  Pay ${REVEAL_PRICE.toFixed(2)} to find out who{' '}
                  <Text style={{ color: T.primary, fontFamily: 'PlayfairDisplay-Italic' }}>
                    {connection?.other_anonymous_name}
                  </Text>
                  {' '}really is. Only their first name is revealed.
                </Text>

                <View style={s.revealPreviewCard}>
                  <Eye size={rs(22)} color={T.primary} strokeWidth={1.8} />
                  <Text style={s.revealPreviewTitle}>What you'll get</Text>
                  <Text style={s.revealPreviewText}>
                    Their real first name — the mystery becomes a person.
                  </Text>
                </View>

                {revealStep === 'phone' ? (
                  <>
                    <Text style={s.phoneLabel}>M-Pesa number</Text>
                    <View style={s.phoneRow}>
                      <TextInput
                        style={s.phoneInput}
                        value={revealPhone}
                        onChangeText={setRevealPhone}
                        placeholder="2547XXXXXXXX"
                        placeholderTextColor={T.textMute}
                        keyboardType="phone-pad"
                        maxLength={12}
                      />
                      <TouchableOpacity
                        style={[s.payBtn, !revealPhone.trim() && { opacity: 0.4 }]}
                        onPress={handleRevealMpesa}
                        disabled={!revealPhone.trim()}
                        hitSlop={HIT_SLOP}
                        activeOpacity={0.85}
                      >
                        <Text style={s.payBtnText}>Pay $1</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      onPress={() => setRevealStep('idle')}
                      hitSlop={HIT_SLOP}
                      style={s.cancelBtn}
                    >
                      <Text style={s.cancelBtnText}>Back</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={s.mpesaBtn}
                      onPress={() => setRevealStep('phone')}
                      hitSlop={HIT_SLOP}
                      activeOpacity={0.9}
                    >
                      <Text style={s.mpesaIcon}>📱</Text>
                      <Text style={s.mpesaBtnText}>Pay with M-Pesa</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setShowRevealModal(false)}
                      hitSlop={HIT_SLOP}
                      style={s.cancelBtn}
                    >
                      <Text style={s.cancelBtnText}>Maybe later</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: T.background },
  centered: { justifyContent: 'center', alignItems: 'center' },

  // Header right
  revealBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(5),
    backgroundColor:   T.primaryDim,
    borderRadius:      RADIUS.full,
    paddingHorizontal: rp(12),
    paddingVertical:   rp(6),
    borderWidth:       1,
    borderColor:       T.primaryBorder,
  },
  revealBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(11),
    color:         T.primary,
    letterSpacing: 0.8,
  },
  revealedTag: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(4),
    backgroundColor:   T.successDim,
    borderRadius:      RADIUS.full,
    paddingHorizontal: rp(10),
    paddingVertical:   rp(5),
    borderWidth:       1,
    borderColor:       'rgba(34,197,94,0.4)',
  },
  revealedTagText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10),
    color:         T.success,
    letterSpacing: 0.6,
  },

  // "was AnonXXX" pill below header after reveal
  wasAnon: {
    fontFamily:        'DMSans-Italic',
    fontSize:          rf(11),
    color:             T.textMute,
    textAlign:         'center',
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(4),
    letterSpacing:     0.4,
  },

  // Confession banner
  confessionBanner: {
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    backgroundColor:   T.surface,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  confessionBannerKicker: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(9),
    color:         T.textMute,
    letterSpacing: 1.8,
    marginBottom:  rp(3),
  },
  confessionBannerText: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.sm,
    color:         T.textSec,
    lineHeight:    rf(20),
    letterSpacing: 0.2,
  },

  // Messages list
  messageList: {
    padding:       SPACING.md,
    gap:           SPACING.xs,
    paddingBottom: SPACING.lg,
  },
  msgRow:    { flexDirection: 'row', marginBottom: rp(6) },
  msgRowOwn: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth:          '78%',
    borderRadius:      RADIUS.xl,
    paddingVertical:   rp(10),
    paddingHorizontal: rp(14),
  },
  bubbleOwn: {
    backgroundColor:         T.primary,
    borderBottomRightRadius: rs(4),
  },
  bubbleTheir: {
    backgroundColor:        T.surface,
    borderBottomLeftRadius: rs(4),
    borderWidth:            1,
    borderColor:            T.border,
  },
  bubbleText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      FONT.md,
    color:         T.text,
    lineHeight:    rf(22),
    letterSpacing: 0.2,
  },
  bubbleTextOwn: { color: '#fff' },
  bubbleTime: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(10),
    color:         T.textMute,
    marginTop:     rp(4),
    textAlign:     'right',
    letterSpacing: 0.2,
  },
  bubbleTimeOwn: { color: 'rgba(255,255,255,0.65)' },

  // Empty
  emptyChat: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        SPACING.xl,
  },
  emptyChatEmoji: { fontSize: rf(40), marginBottom: SPACING.md },
  emptyChatText: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.md,
    color:         T.textSec,
    textAlign:     'center',
    lineHeight:    rf(22),
    letterSpacing: 0.3,
  },

  // Input bar
  inputBar: {
    flexDirection:     'row',
    alignItems:        'flex-end',
    gap:               rp(10),
    paddingHorizontal: SPACING.md,
    paddingTop:        rp(10),
    borderTopWidth:    1,
    borderTopColor:    T.border,
    backgroundColor:   T.background,
  },
  input: {
    flex:              1,
    backgroundColor:   T.surface,
    borderRadius:      RADIUS.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(10),
    paddingTop:        rp(10),
    fontFamily:        'DMSans-Regular',
    fontSize:          FONT.md,
    color:             T.text,
    maxHeight:         rs(100),
    borderWidth:       1,
    borderColor:       T.border,
  },
  sendBtn: {
    width:           rs(44),
    height:          rs(44),
    borderRadius:    rs(22),
    backgroundColor: T.primary,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     T.primary,
    shadowOpacity:   0.35,
    shadowRadius:    10,
    shadowOffset:    { width: 0, height: 3 },
    elevation:       4,
  },

  // ── Reveal modal ──
  modalOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent:  'flex-end',
  },
  modalSheet: {
    backgroundColor:      T.surface,
    borderTopLeftRadius:  RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding:              SPACING.lg,
    paddingBottom:        SPACING.xl,
    borderTopWidth:       1,
    borderTopColor:       T.border,
  },
  modalHandle: {
    width:           rs(40),
    height:          rs(4),
    backgroundColor: T.border,
    borderRadius:    rs(2),
    alignSelf:       'center',
    marginBottom:    SPACING.md,
  },
  modalTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(24),
    color:         T.text,
    marginBottom:  rp(8),
    textAlign:     'center',
    letterSpacing: 0.3,
  },
  modalSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textSec,
    textAlign:     'center',
    lineHeight:    rf(20),
    marginBottom:  SPACING.md,
    letterSpacing: 0.3,
  },

  revealPreviewCard: {
    backgroundColor: T.surfaceAlt,
    borderRadius:    RADIUS.lg,
    padding:         SPACING.md,
    alignItems:      'center',
    gap:             rp(6),
    marginBottom:    SPACING.lg,
    borderWidth:     1,
    borderColor:     T.border,
  },
  revealPreviewTitle: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         T.text,
    letterSpacing: 0.3,
  },
  revealPreviewText: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(12),
    color:         T.textSec,
    textAlign:     'center',
    letterSpacing: 0.2,
  },

  mpesaBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             rp(10),
    backgroundColor: T.primary,
    borderRadius:    RADIUS.lg,
    paddingVertical: rp(15),
    marginBottom:    SPACING.sm,
    shadowColor:     T.primary,
    shadowOpacity:   0.35,
    shadowRadius:    12,
    shadowOffset:    { width: 0, height: 4 },
    elevation:       4,
  },
  mpesaIcon: { fontSize: rf(20) },
  mpesaBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.md,
    color:         '#fff',
    letterSpacing: 0.4,
  },

  phoneLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         T.textSec,
    marginBottom:  SPACING.xs,
    letterSpacing: 0.4,
  },
  phoneRow: {
    flexDirection: 'row',
    gap:           rp(10),
    marginBottom:  SPACING.sm,
  },
  phoneInput: {
    flex:              1,
    backgroundColor:   T.surfaceAlt,
    borderRadius:      RADIUS.md,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
    fontFamily:        'DMSans-Regular',
    fontSize:          FONT.md,
    color:             T.text,
    borderWidth:       1,
    borderColor:       T.border,
  },
  payBtn: {
    paddingHorizontal: rp(18),
    paddingVertical:   rp(12),
    borderRadius:      RADIUS.md,
    backgroundColor:   T.primary,
    alignItems:        'center',
    justifyContent:    'center',
  },
  payBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         '#fff',
    letterSpacing: 0.4,
  },
  cancelBtn: { alignItems: 'center', paddingVertical: rp(10) },
  cancelBtnText: {
    fontFamily: 'DMSans-Italic',
    fontSize:   FONT.sm,
    color:      T.textSec,
  },

  // Reveal success
  revealSuccess: { alignItems: 'center', paddingVertical: SPACING.sm },
  revealSuccessEmoji: {
    fontSize:     rf(56),
    marginBottom: SPACING.sm,
  },
  revealSuccessKicker: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(11),
    color:         T.textMute,
    letterSpacing: 2.2,
    marginBottom:  rp(6),
  },
  revealSuccessName: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(40),
    color:         T.primary,
    marginBottom:  SPACING.sm,
    letterSpacing: 0.3,
  },
  revealSuccessSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.md,
    color:         T.textSec,
    textAlign:     'center',
    marginBottom:  SPACING.lg,
    lineHeight:    rf(22),
    letterSpacing: 0.2,
  },
  revealDoneBtn: {
    backgroundColor:   T.primary,
    borderRadius:      RADIUS.lg,
    paddingHorizontal: SPACING.xl,
    paddingVertical:   rp(14),
    shadowColor:       T.primary,
    shadowOpacity:     0.35,
    shadowRadius:      12,
    shadowOffset:      { width: 0, height: 4 },
    elevation:         4,
  },
  revealDoneBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.md,
    color:         '#fff',
    letterSpacing: 0.4,
  },

  revealWaiting: { alignItems: 'center', padding: SPACING.md, gap: SPACING.sm },
  revealWaitTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.lg,
    color:         T.text,
    letterSpacing: 0.3,
  },
  revealWaitSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textSec,
    letterSpacing: 0.2,
  },
});
