import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  StyleSheet,
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native'; // ✅ added
import { Send, Mic, Image as ImageIcon, ArrowLeft, Lock, Clock, Unlock } from 'lucide-react-native';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMessages, sendMessage } from '../../store/slices/chatSlice';
import { getConnectionDetails } from '../../services/connectApi'; // ✅ added

const { height, width } = Dimensions.get('window');

const THEME = {
  background: '#0b0f18',
  backgroundDark: '#06080f',
  surface: '#151924',
  surfaceDark: '#10131c',
  primary: '#FF634A',
  primaryDark: '#ff3b2f',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.05)',
  input: 'rgba(30, 35, 45, 0.7)',
  warning: '#F39C12',
  gold: '#F1C40F',
};

const MESSAGE_LIMIT = 50;
const WARN_AT = 40;

const formatMessageTime = (raw) => {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    const now = new Date();
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays < 7) {
      return d.toLocaleDateString([], { weekday: 'short' }) + ' ' +
             d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
             d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  } catch {
    return '';
  }
};

// ─────────────────────────────────────────────
// STARRY BACKGROUND
// ─────────────────────────────────────────────
const StarryBackground = () => {
  const stars = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      top: Math.random() * height,
      left: Math.random() * width,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.6 + 0.2,
    }));
  }, []);

  return (
    <>
      {stars.map((star) => (
        <View
          key={star.id}
          style={{
            position: 'absolute',
            backgroundColor: THEME.primary,
            borderRadius: 50,
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
          }}
        />
      ))}
    </>
  );
};

// ─────────────────────────────────────────────
// MESSAGE COUNTER BAR
// ─────────────────────────────────────────────
function MessageCounterBar({ messageCount, isPremium, isBroadcastOwner }) {
  if (isPremium || isBroadcastOwner) {
    return (
      <View style={counterStyles.bar}>
        <Text style={[counterStyles.text, { color: THEME.gold }]}>
          ✨ Unlimited messages
        </Text>
      </View>
    );
  }

  const remaining = MESSAGE_LIMIT - messageCount;
  const isLow = messageCount >= WARN_AT;

  return (
    <View style={counterStyles.bar}>
      <View style={counterStyles.row}>
        <View style={[counterStyles.dot, { backgroundColor: isLow ? THEME.warning : THEME.primary }]} />
        <Text style={[counterStyles.text, { color: isLow ? THEME.warning : THEME.textSecondary }]}>
          {messageCount}/{MESSAGE_LIMIT} messages{isLow ? ` • ${remaining} left` : ''}
        </Text>
      </View>
    </View>
  );
}

const counterStyles = StyleSheet.create({
  bar: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 12, fontWeight: '500' },
});

// ─────────────────────────────────────────────
// EXPIRATION TIMER
// ─────────────────────────────────────────────
function ExpirationTimer({ expiresAt, isPremium }) {
  if (isPremium || !expiresAt) return null;

  const daysRemaining = Math.max(
    0,
    Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24))
  );
  const isUrgent = daysRemaining <= 1;

  return (
    <View style={timerStyles.row}>
      <Clock size={11} color={isUrgent ? THEME.warning : THEME.textSecondary} />
      <Text style={[timerStyles.text, { color: isUrgent ? THEME.warning : THEME.textSecondary }]}>
        {daysRemaining === 0 ? 'Expires today' : `Expires in ${daysRemaining}d`}
      </Text>
    </View>
  );
}

const timerStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  text: { fontSize: 11 },
});

// ─────────────────────────────────────────────
// UNLOCK BANNER
// ─────────────────────────────────────────────
function UnlockBanner({ messageCount, onUnlock }) {
  const isWall = messageCount >= MESSAGE_LIMIT;
  const remaining = MESSAGE_LIMIT - messageCount;

  if (messageCount < WARN_AT) return null;

  return (
    <View
      style={[
        bannerStyles.container,
        { backgroundColor: isWall ? 'rgba(255,99,74,0.15)' : 'rgba(243,156,18,0.1)' },
      ]}
    >
      <View style={bannerStyles.left}>
        <Lock size={16} color={isWall ? THEME.primary : THEME.warning} />
        <Text style={[bannerStyles.text, { color: isWall ? THEME.primary : THEME.warning }]}>
          {isWall ? 'Message limit reached' : `⚠️ ${remaining} message${remaining === 1 ? '' : 's'} left`}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onUnlock}
        style={[
          bannerStyles.button,
          {
            backgroundColor: isWall ? THEME.primary : 'transparent',
            borderColor: isWall ? THEME.primary : THEME.warning,
            borderWidth: isWall ? 0 : 1,
          },
        ]}
        activeOpacity={0.8}
      >
        <Unlock size={13} color={isWall ? '#fff' : THEME.warning} />
        <Text style={[bannerStyles.buttonText, { color: isWall ? '#fff' : THEME.warning }]}>
          Unlock $2
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontSize: 13, fontWeight: '600' },
  button: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  buttonText: { fontSize: 13, fontWeight: '700' },
});

// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────
export default function ChatScreen({ route, navigation }) {
  const {
    chatId,
    recipientName,
    messageCount: initialMessageCount = 0,
    isPremium: initialIsPremium = false,
    isBroadcastOwner = false,
    expiresAt: initialExpiresAt = null,
    connectionId = null,
  } = route.params;

  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const messages = useSelector((state) => state.chat.messages[chatId] || []);

  const [messageText, setMessageText] = useState('');
  const [messageCount, setMessageCount] = useState(initialMessageCount);
  const [isPremium, setIsPremium] = useState(initialIsPremium);   // ✅ now state, not prop
  const [expiresAt, setExpiresAt] = useState(initialExpiresAt);   // ✅ now state, not prop
  const flatListRef = useRef(null);

  const isAtLimit = !isPremium && !isBroadcastOwner && messageCount >= MESSAGE_LIMIT;

  // ─────────────────────────────────────────────
  // ✅ Refresh connection status every time this
  // screen comes into focus. This catches the
  // premium upgrade when returning from
  // UnlockPremiumScreen — no manual reload needed.
  // ─────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (!connectionId) return

      const refreshStatus = async () => {
        try {
          const data = await getConnectionDetails(connectionId)
          const conn = data?.connection
          if (!conn) return

          if (conn.status === 'premium') {
            setIsPremium(true)
            setExpiresAt(null)
          }

          if (conn.expires_at && conn.status !== 'premium') {
            setExpiresAt(conn.expires_at)
          }

          if (conn.message_count !== undefined) {
            setMessageCount(conn.message_count)
          }
        } catch { /* silent */ }
      }

      refreshStatus()
    }, [connectionId])
  )

  useEffect(() => {
    dispatch(fetchMessages({ chatId }));
  }, [chatId]);

  useEffect(() => {
    if (messages.length > 0) {
      setMessageCount(messages.length);
    }
  }, [messages.length]);

  const handleSend = () => {
    if (!messageText.trim() || isAtLimit) return;
    dispatch(sendMessage({ chatId, message: { content: messageText.trim(), type: 'text' } }));
    setMessageCount((prev) => prev + 1);
    setMessageText('');
  };

  const handleUnlock = () => {
    navigation.navigate('UnlockPremium', { connectionId, chatId });
  };

  const renderMessage = ({ item }) => {
    const isOwn = item.senderId === user?.id;
    return (
      <View style={[styles.messageContainer, isOwn ? styles.ownMessage : styles.theirMessage]}>
        {!isOwn && <Image source={{ uri: item.senderAvatar }} style={styles.messageAvatar} />}
        <View style={styles.messageBubbleWrapper}>
          <View style={[styles.messageAccentBar, isOwn ? styles.ownAccentBar : styles.theirAccentBar]} />
          <View style={[styles.messageBubble, isOwn ? styles.ownBubble : styles.theirBubble]}>
            {!isOwn && <Text style={styles.senderName}>{item.senderName}</Text>}
            <Text style={styles.messageText}>{item.content}</Text>
            <Text style={styles.messageTime}>{formatMessageTime(item.createdAt)}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={24} color={THEME.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{recipientName}</Text>
          <ExpirationTimer expiresAt={expiresAt} isPremium={isPremium} />
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Message counter */}
      <MessageCounterBar
        messageCount={messageCount}
        isPremium={isPremium}
        isBroadcastOwner={isBroadcastOwner}
      />

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        inverted
        showsVerticalScrollIndicator={false}
      />

      {/* Unlock banner — hidden once premium */}
      {!isPremium && !isBroadcastOwner && (
        <UnlockBanner messageCount={messageCount} onUnlock={handleUnlock} />
      )}

      {/* Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inputContainerWrapper}
      >
        <View style={styles.inputAccentBar} />
        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={[styles.attachButton, !isPremium && styles.attachButtonDisabled]}
            disabled={!isPremium}
            onPress={!isPremium ? handleUnlock : undefined}
          >
            <ImageIcon size={22} color={isPremium ? THEME.primary : THEME.textSecondary} />
          </TouchableOpacity>

          <TextInput
            value={messageText}
            onChangeText={setMessageText}
            placeholder={isAtLimit ? 'Unlock to keep chatting...' : 'Type a message...'}
            placeholderTextColor={THEME.textSecondary}
            style={[styles.input, isAtLimit && styles.inputDisabled]}
            multiline
            maxLength={1000}
            editable={!isAtLimit}
          />

          {messageText.trim() && !isAtLimit ? (
            <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
              <Send size={20} color="#ffffff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.voiceButton, !isPremium && styles.voiceButtonDisabled]}
              disabled={!isPremium}
              onPress={!isPremium ? handleUnlock : undefined}
            >
              <Mic size={22} color={isPremium ? THEME.primary : THEME.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  backButton: { padding: 8, width: 40 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: THEME.text },
  messagesList: { padding: 16, paddingBottom: 8 },
  messageContainer: { flexDirection: 'row', marginBottom: 16, maxWidth: '80%' },
  ownMessage: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  theirMessage: { alignSelf: 'flex-start' },
  messageAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: THEME.surfaceDark },
  messageBubbleWrapper: { position: 'relative', maxWidth: '100%' },
  messageAccentBar: { position: 'absolute', top: 0, bottom: 0, width: 4, borderRadius: 12, opacity: 0.6 },
  ownAccentBar: { right: 0, backgroundColor: THEME.primary, borderTopRightRadius: 16, borderBottomRightRadius: 16 },
  theirAccentBar: { left: 0, backgroundColor: THEME.primary, borderTopLeftRadius: 16, borderBottomLeftRadius: 16, opacity: 0.4 },
  messageBubble: {
    borderRadius: 16, padding: 14, maxWidth: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  ownBubble: { backgroundColor: THEME.primary, paddingRight: 18 },
  theirBubble: { backgroundColor: THEME.surface, paddingLeft: 18 },
  senderName: { color: THEME.textSecondary, fontSize: 12, marginBottom: 4, fontWeight: '600' },
  messageText: { color: '#ffffff', fontSize: 15, lineHeight: 22 },
  messageTime: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 6 },
  inputContainerWrapper: { position: 'relative' },
  inputAccentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: THEME.primary, opacity: 0.4 },
  inputContainer: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 16, paddingVertical: 12, paddingLeft: 20,
    backgroundColor: THEME.surfaceDark,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 8,
  },
  attachButton: { padding: 10, marginRight: 8, backgroundColor: 'rgba(255, 99, 74, 0.1)', borderRadius: 20 },
  attachButtonDisabled: { backgroundColor: 'rgba(255,255,255,0.05)' },
  input: {
    flex: 1, backgroundColor: THEME.input, color: THEME.text,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    fontSize: 16, maxHeight: 100, marginRight: 8,
  },
  inputDisabled: { opacity: 0.5 },
  sendButton: {
    backgroundColor: THEME.primary, borderRadius: 20, padding: 10,
    shadowColor: THEME.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  voiceButton: { padding: 10, backgroundColor: 'rgba(255, 99, 74, 0.1)', borderRadius: 20 },
  voiceButtonDisabled: { backgroundColor: 'rgba(255,255,255,0.05)' },
});
