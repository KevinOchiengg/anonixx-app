/**
 * DropChatScreen
 * Anonymous chat for Drops connections.
 * Includes reveal ceremony flow.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, Animated, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Send, Sparkles, Lock, CheckCircle,
  Eye, Clock,
} from 'lucide-react-native';
import { API_BASE_URL } from '../../config/api';
import StarryBackground from '../../components/common/StarryBackground';

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  surfaceAlt: '#1a1f2e',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.06)',
  myBubble: '#FF634A',
  theirBubble: '#1a1f2e',
};

const REVEAL_PRICE = 1.00;

export default function DropChatScreen({ route, navigation }) {
  const { connectionId } = route.params;
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState([]);
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const [showRevealModal, setShowRevealModal] = useState(false);
  const [revealStep, setRevealStep] = useState('idle'); // idle | phone | waiting | polling | done
  const [revealPhone, setRevealPhone] = useState('');
  const [revealData, setRevealData] = useState(null);
  const [pollInterval, setPollInterval] = useState(null);

  const flatListRef = useRef(null);
  const revealScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    load();
    const interval = setInterval(() => loadMessages(true), 8000);
    return () => { clearInterval(interval); if (pollInterval) clearInterval(pollInterval); };
  }, []);

  const load = async () => {
    setLoading(true);
    await loadMessages(false);
    setLoading(false);
  };

  const loadMessages = async (silent = false) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/drops/connections/${connectionId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
        setConnection(data.connection);
        // Check reveal status
        if (data.connection?.is_revealed && !revealData) {
          checkRevealStatus();
        }
      }
    } catch (e) { console.error(e); }
  };

  const checkRevealStatus = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/drops/connections/${connectionId}/reveal/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.revealed) setRevealData(data);
      }
    } catch (e) {}
  };

  const handleSend = async () => {
    const content = text.trim();
    if (!content) return;
    setText('');
    setSending(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${API_BASE_URL}/api/v1/drops/connections/${connectionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content }),
      });
      await loadMessages(true);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) { Alert.alert('Error', 'Failed to send'); }
    finally { setSending(false); }
  };

  const handleRevealMpesa = async () => {
    if (!revealPhone.trim()) return;
    setRevealStep('waiting');
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/drops/connections/${connectionId}/reveal/mpesa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone_number: revealPhone.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setRevealStep('polling');
        startRevealPolling();
      } else {
        Alert.alert('Error', data.detail || 'Payment failed');
        setRevealStep('phone');
      }
    } catch (e) {
      Alert.alert('Error', 'Something went wrong');
      setRevealStep('phone');
    }
  };

  const startRevealPolling = () => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 24) {
        clearInterval(interval);
        setRevealStep('idle');
        Alert.alert('Timeout', 'Payment timed out. Try again.');
        return;
      }
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/api/v1/drops/connections/${connectionId}/reveal/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.revealed) {
          clearInterval(interval);
          setRevealData(data);
          setRevealStep('done');
          Animated.spring(revealScale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
        }
      } catch (e) {}
    }, 5000);
    setPollInterval(interval);
  };

  const renderMessage = ({ item, index }) => {
    const isOwn = item.is_own;
    return (
      <View style={[styles.msgRow, isOwn && styles.msgRowOwn]}>
      <StarryBackground />
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleTheir]}>
          <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>
            {item.content}
          </Text>
          <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>
            {item.time_ago}
          </Text>
        </View>
      </View>
    );
  };

  // ── Reveal Modal ──────────────────────────────────────────
  const RevealModal = () => (
    <Modal visible={showRevealModal} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          {revealStep === 'done' ? (
            <Animated.View style={[styles.revealSuccess, { transform: [{ scale: revealScale }] }]}>
              <Text style={styles.revealSuccessEmoji}>🎭</Text>
              <Text style={styles.revealSuccessTitle}>Mystery Solved</Text>
              <Text style={styles.revealSuccessName}>{revealData?.revealed_name}</Text>
              <Text style={styles.revealSuccessSub}>
                {connection?.other_anonymous_name} is{' '}
                <Text style={{ color: THEME.primary, fontWeight: '700' }}>
                  {revealData?.revealed_name}
                </Text>
              </Text>
              <TouchableOpacity
                style={styles.revealDoneBtn}
                onPress={() => setShowRevealModal(false)}
              >
                <Text style={styles.revealDoneBtnText}>Close</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : revealStep === 'polling' || revealStep === 'waiting' ? (
            <View style={styles.revealWaiting}>
              <ActivityIndicator color={THEME.primary} size="large" />
              <Text style={styles.revealWaitTitle}>
                {revealStep === 'waiting' ? 'Sending STK push...' : 'Waiting for payment...'}
              </Text>
              <Text style={styles.revealWaitSub}>Enter your M-Pesa PIN on your phone</Text>
            </View>
          ) : (
            <>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Reveal Identity</Text>
              <Text style={styles.modalSub}>
                Pay ${REVEAL_PRICE} to find out who{' '}
                <Text style={{ color: THEME.primary }}>{connection?.other_anonymous_name}</Text>{' '}
                really is. Only their first name is revealed.
              </Text>

              <View style={styles.revealPreviewCard}>
                <Eye size={24} color={THEME.primary} />
                <Text style={styles.revealPreviewTitle}>What you'll get</Text>
                <Text style={styles.revealPreviewText}>
                  Their real first name — the mystery becomes a person.
                </Text>
              </View>

              {revealStep === 'phone' ? (
                <>
                  <Text style={styles.phoneLabel}>M-Pesa number</Text>
                  <View style={styles.phoneRow}>
                    <TextInput
                      style={styles.phoneInput}
                      value={revealPhone}
                      onChangeText={setRevealPhone}
                      placeholder="2547XXXXXXXX"
                      placeholderTextColor={THEME.textSecondary}
                      keyboardType="phone-pad"
                      maxLength={12}
                    />
                    <TouchableOpacity
                      style={[styles.payBtn, !revealPhone.trim() && { opacity: 0.4 }]}
                      onPress={handleRevealMpesa}
                      disabled={!revealPhone.trim()}
                    >
                      <Text style={styles.payBtnText}>Pay $1</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    onPress={() => setRevealStep('idle')}
                    style={styles.cancelBtn}
                  >
                    <Text style={styles.cancelBtnText}>Back</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.mpesaBtn}
                    onPress={() => setRevealStep('phone')}
                  >
                    <Text style={styles.mpesaIcon}>📱</Text>
                    <Text style={styles.mpesaBtnText}>Pay with M-Pesa</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowRevealModal(false)}
                    style={styles.cancelBtn}
                  >
                    <Text style={styles.cancelBtnText}>Maybe later</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={THEME.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={THEME.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerName} numberOfLines={1}>
            {revealData?.revealed_name
              ? `${revealData.revealed_name} (was ${connection?.other_anonymous_name})`
              : connection?.other_anonymous_name || 'Anonymous'}
          </Text>
          {connection?.confession && (
            <Text style={styles.headerConfession} numberOfLines={1}>
              "{connection.confession}"
            </Text>
          )}
        </View>

        {/* Reveal button */}
        {connection && !connection.is_revealed && (
          <TouchableOpacity
            style={styles.revealBtn}
            onPress={() => { setRevealStep('idle'); setShowRevealModal(true); }}
          >
            <Sparkles size={16} color={THEME.primary} />
            <Text style={styles.revealBtnText}>Reveal</Text>
          </TouchableOpacity>
        )}
        {connection?.is_revealed && (
          <View style={styles.revealedTag}>
            <CheckCircle size={14} color="#47FFB8" />
            <Text style={styles.revealedTagText}>Revealed</Text>
          </View>
        )}
      </View>

      {/* Confession banner */}
      {connection?.confession && (
        <View style={styles.confessionBanner}>
          <Text style={styles.confessionBannerText}>
            💬 "{connection.confession}"
          </Text>
        </View>
      )}

      {/* Messages */}
      {messages.length === 0 ? (
        <View style={styles.emptyChat}>
          <Text style={styles.emptyChatEmoji}>👋</Text>
          <Text style={styles.emptyChatText}>
            Say hi — you're both anonymous. Break the ice.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Input */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Say something..."
          placeholderTextColor={THEME.textSecondary}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Send size={18} color="#fff" />}
        </TouchableOpacity>
      </View>

      <RevealModal />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  centered: { justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: THEME.border, gap: 10,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.surface,
  },
  headerCenter: { flex: 1 },
  headerName: { fontSize: 15, fontWeight: '700', color: THEME.text },
  headerConfession: { fontSize: 11, color: THEME.textSecondary, fontStyle: 'italic', marginTop: 2 },

  revealBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,99,74,0.12)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,99,74,0.3)',
  },
  revealBtnText: { fontSize: 13, fontWeight: '700', color: THEME.primary },
  revealedTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(71,255,184,0.1)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  revealedTagText: { fontSize: 12, color: '#47FFB8', fontWeight: '600' },

  confessionBanner: {
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: THEME.surface,
    borderBottomWidth: 1, borderBottomColor: THEME.border,
  },
  confessionBannerText: { fontSize: 13, color: THEME.textSecondary, fontStyle: 'italic' },

  messageList: { padding: 16, gap: 8, paddingBottom: 20 },
  msgRow: { flexDirection: 'row', marginBottom: 6 },
  msgRowOwn: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%', borderRadius: 18, padding: 12,
    paddingHorizontal: 14,
  },
  bubbleOwn: { backgroundColor: THEME.myBubble, borderBottomRightRadius: 4 },
  bubbleTheir: { backgroundColor: THEME.theirBubble, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, color: THEME.textSecondary, lineHeight: 22 },
  bubbleTextOwn: { color: '#fff' },
  bubbleTime: { fontSize: 10, color: THEME.textSecondary, marginTop: 4, textAlign: 'right' },
  bubbleTimeOwn: { color: 'rgba(255,255,255,0.6)' },

  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyChatEmoji: { fontSize: 40, marginBottom: 16 },
  emptyChatText: { fontSize: 15, color: THEME.textSecondary, textAlign: 'center', lineHeight: 22 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: THEME.border,
    backgroundColor: THEME.background,
  },
  input: {
    flex: 1, backgroundColor: THEME.surface, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, paddingTop: 10,
    fontSize: 15, color: THEME.text, maxHeight: 100,
    borderWidth: 1, borderColor: THEME.border,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: THEME.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: THEME.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: THEME.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: THEME.text, marginBottom: 8, textAlign: 'center' },
  modalSub: { fontSize: 14, color: THEME.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 20 },

  revealPreviewCard: {
    backgroundColor: THEME.surfaceAlt, borderRadius: 16, padding: 18,
    alignItems: 'center', gap: 8, marginBottom: 24,
    borderWidth: 1, borderColor: THEME.border,
  },
  revealPreviewTitle: { fontSize: 15, fontWeight: '700', color: THEME.text },
  revealPreviewText: { fontSize: 13, color: THEME.textSecondary, textAlign: 'center' },

  mpesaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: THEME.primary, borderRadius: 16,
    paddingVertical: 15, marginBottom: 12,
  },
  mpesaIcon: { fontSize: 20 },
  mpesaBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  phoneLabel: { fontSize: 13, color: THEME.textSecondary, marginBottom: 8 },
  phoneRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  phoneInput: {
    flex: 1, backgroundColor: THEME.surfaceAlt, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: THEME.text, borderWidth: 1, borderColor: THEME.border,
  },
  payBtn: {
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14,
    backgroundColor: THEME.primary, alignItems: 'center', justifyContent: 'center',
  },
  payBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { fontSize: 14, color: THEME.textSecondary },

  // Reveal success
  revealSuccess: { alignItems: 'center', padding: 10 },
  revealSuccessEmoji: { fontSize: 56, marginBottom: 12 },
  revealSuccessTitle: { fontSize: 22, fontWeight: '800', color: THEME.text, marginBottom: 6 },
  revealSuccessName: { fontSize: 36, fontWeight: '800', color: THEME.primary, marginBottom: 10 },
  revealSuccessSub: { fontSize: 15, color: THEME.textSecondary, textAlign: 'center', marginBottom: 24 },
  revealDoneBtn: {
    backgroundColor: THEME.primary, borderRadius: 16,
    paddingHorizontal: 32, paddingVertical: 14,
  },
  revealDoneBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  revealWaiting: { alignItems: 'center', padding: 20, gap: 12 },
  revealWaitTitle: { fontSize: 17, fontWeight: '700', color: THEME.text },
  revealWaitSub: { fontSize: 14, color: THEME.textSecondary },
});
