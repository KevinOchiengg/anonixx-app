/**
 * ChatScreen.jsx
 * Anonymous chat between two connected users.
 * Features: message limit, $2 unlock, identity reveal request/response.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import { useFocusEffect } from '@react-navigation/native';

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  surfaceAlt: '#1a1f2e',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.06)',
  avatarBg: '#1e2330',
  myBubble: '#FF634A',
  theirBubble: '#1e2535',
};

const AVATAR_MAP = {
  ghost: '👻', shadow: '🌑', flame: '🔥', void: '🕳️',
  storm: '⛈️', smoke: '💨', eclipse: '🌘', shard: '🔷',
  moth: '🦋', raven: '🐦‍⬛',
};

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}


// ─── MESSAGE BUBBLE ──────────────────────────────────────────
function MessageBubble({ message, showTime }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(message.is_own ? 12 : -12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[
      styles.bubbleRow,
      message.is_own ? styles.bubbleRowOwn : styles.bubbleRowTheir,
      { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }
    ]}>
      <View style={[styles.bubble, message.is_own ? styles.bubbleOwn : styles.bubbleTheir]}>
        <Text style={[styles.bubbleText, message.is_own && styles.bubbleTextOwn]}>
          {message.content}
        </Text>
      </View>
      {showTime && (
        <Text style={[styles.bubbleTime, message.is_own && styles.bubbleTimeOwn]}>
          {formatTime(message.created_at)}
          {message.is_own && message.is_read && '  ✓'}
        </Text>
      )}
    </Animated.View>
  );
}


// ─── LIMIT BANNER ────────────────────────────────────────────
function LimitBanner({ messagesLeft, onUnlock }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.02, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  if (messagesLeft === null || messagesLeft > 5) return null;

  if (messagesLeft === 0) {
    return (
      <Animated.View style={[styles.limitBanner, styles.limitBannerFull, { transform: [{ scale: pulseAnim }] }]}>
        <Text style={styles.limitBannerTitle}>Message limit reached</Text>
        <Text style={styles.limitBannerBody}>Unlock this chat for $2 — no more limits, ever.</Text>
        <TouchableOpacity style={styles.unlockBtn} onPress={onUnlock} activeOpacity={0.8}>
          <Text style={styles.unlockBtnText}>Unlock — $2</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <View style={styles.limitBannerWarn}>
      <Text style={styles.limitBannerWarnText}>
        {messagesLeft} free {messagesLeft === 1 ? 'message' : 'messages'} left
        {'  ·  '}
        <Text style={styles.limitBannerLink} onPress={onUnlock}>Unlock $2</Text>
      </Text>
    </View>
  );
}


// ─── REVEAL MODAL ────────────────────────────────────────────
function RevealModal({ visible, chat, onAccept, onDecline, onRequest, onClose }) {
  if (!visible) return null;

  const isPending  = chat?.reveal_status === 'pending';
  const isInitiator = chat?.reveal_initiator;
  const isAccepted = chat?.reveal_status === 'accepted';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.revealBackdrop}>
        <View style={styles.revealCard}>
          <Text style={styles.revealEmoji}>
            {isAccepted ? '✨' : isPending && !isInitiator ? '👁' : '🌑'}
          </Text>

          {isAccepted ? (
            <>
              <Text style={styles.revealTitle}>Identities revealed</Text>
              <Text style={styles.revealBody}>You both chose to be seen.</Text>
            </>
          ) : isPending && !isInitiator ? (
            <>
              <Text style={styles.revealTitle}>They want to reveal</Text>
              <Text style={styles.revealBody}>
                They're asking to show you who they really are. You don't have to say yes.
              </Text>
              <TouchableOpacity style={styles.revealAcceptBtn} onPress={onAccept} activeOpacity={0.8}>
                <Text style={styles.revealAcceptText}>Reveal each other</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.revealDeclineBtn} onPress={onDecline} activeOpacity={0.8}>
                <Text style={styles.revealDeclineText}>Stay anonymous</Text>
              </TouchableOpacity>
            </>
          ) : isPending && isInitiator ? (
            <>
              <Text style={styles.revealTitle}>Waiting...</Text>
              <Text style={styles.revealBody}>Your reveal request has been sent. Waiting for their response.</Text>
            </>
          ) : (
            <>
              <Text style={styles.revealTitle}>Reveal identity?</Text>
              <Text style={styles.revealBody}>
                Send a request to reveal who you both are. They must agree for anything to be shown.
              </Text>
              <TouchableOpacity style={styles.revealAcceptBtn} onPress={onRequest} activeOpacity={0.8}>
                <Text style={styles.revealAcceptText}>Send reveal request</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.revealCloseBtn} onPress={onClose}>
            <Text style={styles.revealCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}


// ─── MAIN SCREEN ──────────────────────────────────────────────
export default function ChatScreen({ route, navigation }) {
  const { chatId, otherName, otherAvatar, otherAvatarColor } = route.params || {};

  const [messages, setMessages]           = useState([]);
  const [chatInfo, setChatInfo]           = useState(null);
  const [loading, setLoading]             = useState(true);
  const [inputText, setInputText]         = useState('');
  const [sending, setSending]             = useState(false);
  const [showReveal, setShowReveal]       = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);

  const flatListRef = useRef(null);
  const pollRef     = useRef(null);

  useFocusEffect(
    useCallback(() => {
      loadMessages();
      pollRef.current = setInterval(loadMessages, 5000);
      return () => clearInterval(pollRef.current);
    }, [chatId])
  );

  const loadMessages = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setMessages(data.messages || []);
        setChatInfo(data.chat);
      }
    } catch (e) {
      console.log('Load messages error:', e);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    const content = inputText.trim();
    if (!content || sending) return;
    if (chatInfo?.messages_left === 0 && !chatInfo?.is_unlocked) return;

    setSending(true);
    const tempId = `temp_${Date.now()}`;

    setMessages((prev) => [...prev, {
      id: tempId, content, is_own: true, is_read: false,
      created_at: new Date().toISOString(),
    }]);
    setInputText('');
    scrollToBottom();

    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chat_id: chatId, content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        if (res.status === 402) setChatInfo((prev) => ({ ...prev, messages_left: 0 }));
      } else {
        if (data.messages_left !== undefined) {
          setChatInfo((prev) => ({ ...prev, messages_left: data.messages_left }));
        }
        loadMessages();
      }
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleUnlock = () => navigation.navigate('UnlockPremium', { chatId, otherName });

  const handleRevealRequest = async () => {
    setRevealLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/reveal/request`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setChatInfo((prev) => ({ ...prev, reveal_status: 'pending', reveal_initiator: true }));
    } catch (e) {
      console.log('Reveal request error:', e);
    } finally {
      setRevealLoading(false);
    }
  };

  const handleRevealRespond = async (accept) => {
    setRevealLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/reveal/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reveal_id: chatId, accept }),
      });
      const data = await res.json();
      if (res.ok) {
        if (accept && data.other_user) {
          setChatInfo((prev) => ({ ...prev, reveal_status: 'accepted', revealed_other: data.other_user }));
        } else {
          setChatInfo((prev) => ({ ...prev, reveal_status: 'declined' }));
          setShowReveal(false);
        }
      }
    } catch (e) {
      console.log('Reveal respond error:', e);
    } finally {
      setRevealLoading(false);
    }
  };

  const isBlocked = chatInfo?.messages_left === 0 && !chatInfo?.is_unlocked;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.headerAvatar, {
            backgroundColor: (otherAvatarColor || '#FF634A') + '22',
            borderColor: (otherAvatarColor || '#FF634A') + '55',
          }]}>
            <Text style={styles.headerAvatarEmoji}>{AVATAR_MAP[otherAvatar] || '👤'}</Text>
          </View>
          <View>
            <Text style={styles.headerName}>{otherName || 'Anonymous'}</Text>
            <Text style={styles.headerSub}>Anonymous connection</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.revealBtn, chatInfo?.reveal_status === 'pending' && styles.revealBtnPending]}
          onPress={() => setShowReveal(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.revealBtnText}>
            {chatInfo?.reveal_status === 'accepted' ? '✨' : '👁'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Limit banner */}
      <LimitBanner messagesLeft={chatInfo?.messages_left} onUnlock={handleUnlock} />

      {/* Messages */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={THEME.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => {
            const isLast  = index === messages.length - 1;
            const nextMsg = messages[index + 1];
            const showTime = isLast || (nextMsg && nextMsg.is_own !== item.is_own);
            return <MessageBubble message={item} showTime={showTime} />;
          }}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={scrollToBottom}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatEmoji}>🌑</Text>
              <Text style={styles.emptyChatText}>You're connected. Say something.</Text>
            </View>
          }
        />
      )}

      {/* Revealed identity banner */}
      {chatInfo?.revealed_other && (
        <View style={styles.revealedBanner}>
          <Text style={styles.revealedBannerText}>✨ {chatInfo.revealed_other.username}</Text>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputBar}>
        <TextInput
          style={[styles.input, isBlocked && styles.inputBlocked]}
          value={inputText}
          onChangeText={setInputText}
          placeholder={isBlocked ? 'Unlock to keep talking...' : 'Say something...'}
          placeholderTextColor={THEME.textSecondary}
          multiline
          maxLength={500}
          editable={!isBlocked}
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!inputText.trim() || sending || isBlocked) && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!inputText.trim() || sending || isBlocked}
          activeOpacity={0.8}
        >
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.sendBtnText}>↑</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Reveal modal */}
      <RevealModal
        visible={showReveal}
        chat={chatInfo}
        onAccept={() => handleRevealRespond(true)}
        onDecline={() => handleRevealRespond(false)}
        onRequest={handleRevealRequest}
        onClose={() => setShowReveal(false)}
      />
    </KeyboardAvoidingView>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },

  // Header
  header:            { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16, backgroundColor: THEME.surface, borderBottomWidth: 1, borderBottomColor: THEME.border, gap: 12 },
  backBtn:           { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backBtnText:       { color: THEME.text, fontSize: 22 },
  headerCenter:      { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar:      { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  headerAvatarEmoji: { fontSize: 18 },
  headerName:        { fontSize: 15, fontWeight: '700', color: THEME.text },
  headerSub:         { fontSize: 11, color: THEME.textSecondary, fontStyle: 'italic' },
  revealBtn:         { width: 36, height: 36, borderRadius: 18, backgroundColor: THEME.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: THEME.border },
  revealBtnPending:  { borderColor: THEME.primary, backgroundColor: 'rgba(255,99,74,0.1)' },
  revealBtnText:     { fontSize: 16 },

  // Limit banners
  limitBanner:         {},
  limitBannerWarn:     { paddingHorizontal: 20, paddingVertical: 8, backgroundColor: 'rgba(255,99,74,0.06)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,99,74,0.12)', alignItems: 'center' },
  limitBannerWarnText: { color: THEME.textSecondary, fontSize: 13 },
  limitBannerLink:     { color: THEME.primary, fontWeight: '700' },
  limitBannerFull:     { margin: 16, padding: 20, backgroundColor: THEME.surface, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,99,74,0.2)', gap: 10 },
  limitBannerTitle:    { fontSize: 16, fontWeight: '800', color: THEME.text },
  limitBannerBody:     { fontSize: 13, color: THEME.textSecondary, textAlign: 'center', lineHeight: 20 },
  unlockBtn:           { backgroundColor: THEME.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12, marginTop: 4, shadowColor: THEME.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  unlockBtnText:       { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },

  // Messages
  messagesList:   { paddingHorizontal: 16, paddingVertical: 16, gap: 4, paddingBottom: 20 },
  centered:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyChat:      { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyChatEmoji: { fontSize: 40 },
  emptyChatText:  { color: THEME.textSecondary, fontSize: 14, fontStyle: 'italic' },

  // Bubbles
  bubbleRow:      { marginVertical: 3, maxWidth: '80%' },
  bubbleRowOwn:   { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleRowTheir: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble:         { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleOwn:      { backgroundColor: THEME.myBubble, borderBottomRightRadius: 4 },
  bubbleTheir:    { backgroundColor: THEME.theirBubble, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: THEME.border },
  bubbleText:     { fontSize: 15, color: THEME.textSecondary, lineHeight: 22 },
  bubbleTextOwn:  { color: '#fff' },
  bubbleTime:     { fontSize: 10, color: THEME.textSecondary, marginTop: 3, marginLeft: 4 },
  bubbleTimeOwn:  { marginRight: 4, marginLeft: 0 },

  // Revealed banner
  revealedBanner:     { backgroundColor: 'rgba(76,175,80,0.08)', borderTopWidth: 1, borderTopColor: 'rgba(76,175,80,0.15)', paddingVertical: 8, alignItems: 'center' },
  revealedBannerText: { color: '#4CAF50', fontSize: 13, fontWeight: '600' },

  // Input
  inputBar:       { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 12, gap: 10, backgroundColor: THEME.surface, borderTopWidth: 1, borderTopColor: THEME.border },
  input:          { flex: 1, backgroundColor: THEME.surfaceAlt, borderRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, color: THEME.text, fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: THEME.border },
  inputBlocked:   { opacity: 0.4 },
  sendBtn:        { width: 40, height: 40, borderRadius: 20, backgroundColor: THEME.primary, alignItems: 'center', justifyContent: 'center', shadowColor: THEME.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3 },
  sendBtnDisabled:{ backgroundColor: THEME.avatarBg, shadowOpacity: 0, elevation: 0 },
  sendBtnText:    { color: '#fff', fontSize: 18, fontWeight: '800' },

  // Reveal modal
  revealBackdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  revealCard:      { backgroundColor: THEME.surface, borderRadius: 24, padding: 28, width: '100%', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: THEME.border },
  revealEmoji:     { fontSize: 48, marginBottom: 4 },
  revealTitle:     { fontSize: 20, fontWeight: '800', color: THEME.text, textAlign: 'center' },
  revealBody:      { fontSize: 14, color: THEME.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  revealAcceptBtn: { width: '100%', backgroundColor: THEME.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center', shadowColor: THEME.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  revealAcceptText:{ color: '#fff', fontSize: 15, fontWeight: '700' },
  revealDeclineBtn:{ width: '100%', paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: THEME.border },
  revealDeclineText:{ color: THEME.textSecondary, fontSize: 14 },
  revealCloseBtn:  { paddingVertical: 8, marginTop: 4 },
  revealCloseText: { color: THEME.textSecondary, fontSize: 13 },
});
