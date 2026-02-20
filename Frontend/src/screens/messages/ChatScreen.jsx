import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Image,
  StyleSheet,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Send, Mic, Image as ImageIcon, ArrowLeft } from 'lucide-react-native';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMessages, sendMessage } from '../../store/slices/chatSlice';

const { height, width } = Dimensions.get('window');

// NEW Cinematic Coral Theme
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
};

// Starry Background Component
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

export default function ChatScreen({ route, navigation }) {
  const { chatId, recipientName } = route.params;
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const messages = useSelector((state) => state.chat.messages[chatId] || []);
  const [messageText, setMessageText] = useState('');
  const flatListRef = useRef(null);

  useEffect(() => {
    dispatch(fetchMessages({ chatId }));
  }, [chatId]);

  const handleSend = () => {
    if (!messageText.trim()) return;

    dispatch(
      sendMessage({
        chatId,
        message: {
          content: messageText.trim(),
          type: 'text',
        },
      })
    );

    setMessageText('');
  };

  const renderMessage = ({ item }) => {
    const isOwn = item.senderId === user?.id;

    return (
      <View
        style={[
          styles.messageContainer,
          isOwn ? styles.ownMessage : styles.theirMessage,
        ]}
      >
        {!isOwn && (
          <Image
            source={{ uri: item.senderAvatar }}
            style={styles.messageAvatar}
          />
        )}
        <View style={styles.messageBubbleWrapper}>
          <View
            style={[
              styles.messageAccentBar,
              isOwn ? styles.ownAccentBar : styles.theirAccentBar,
            ]}
          />
          <View
            style={[
              styles.messageBubble,
              isOwn ? styles.ownBubble : styles.theirBubble,
            ]}
          >
            {!isOwn && <Text style={styles.senderName}>{item.senderName}</Text>}
            <Text style={styles.messageText}>{item.content}</Text>
            <Text style={styles.messageTime}>{item.createdAt}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={THEME.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{recipientName}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        inverted
        showsVerticalScrollIndicator={false}
      />

      {/* Input Container */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inputContainerWrapper}
      >
        <View style={styles.inputAccentBar} />
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.attachButton}>
            <ImageIcon size={22} color={THEME.textSecondary} />
          </TouchableOpacity>

          <TextInput
            value={messageText}
            onChangeText={setMessageText}
            placeholder="Type a message..."
            placeholderTextColor={THEME.textSecondary}
            style={styles.input}
            multiline
            maxLength={1000}
          />

          {messageText.trim() ? (
            <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
              <Send size={20} color="#ffffff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.voiceButton}>
              <Mic size={22} color={THEME.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: THEME.text,
    flex: 1,
    textAlign: 'center',
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    maxWidth: '80%',
  },
  ownMessage: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  theirMessage: {
    alignSelf: 'flex-start',
  },
  messageAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    backgroundColor: THEME.surfaceDark,
  },
  messageBubbleWrapper: {
    position: 'relative',
    maxWidth: '100%',
  },
  messageAccentBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 4,
    borderRadius: 12,
    opacity: 0.6,
  },
  ownAccentBar: {
    right: 0,
    backgroundColor: THEME.primary,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  theirAccentBar: {
    left: 0,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.4,
  },
  messageBubble: {
    borderRadius: 16,
    padding: 14,
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  ownBubble: {
    backgroundColor: THEME.primary,
    paddingRight: 18,
  },
  theirBubble: {
    backgroundColor: THEME.surface,
    paddingLeft: 18,
  },
  senderName: {
    color: THEME.textSecondary,
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  messageText: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 22,
  },
  messageTime: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginTop: 6,
  },
  inputContainerWrapper: {
    position: 'relative',
  },
  inputAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    opacity: 0.4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingLeft: 20,
    backgroundColor: THEME.surfaceDark,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  attachButton: {
    padding: 10,
    marginRight: 8,
    backgroundColor: 'rgba(255, 99, 74, 0.1)',
    borderRadius: 20,
  },
  input: {
    flex: 1,
    backgroundColor: THEME.input,
    color: THEME.text,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: THEME.primary,
    borderRadius: 20,
    padding: 10,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  voiceButton: {
    padding: 10,
    backgroundColor: 'rgba(255, 99, 74, 0.1)',
    borderRadius: 20,
  },
});
