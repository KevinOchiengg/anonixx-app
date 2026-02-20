import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { Users, Info, ArrowLeft } from 'lucide-react-native';
import { useSocket } from '../../hooks/useSocket';
import {
  fetchMessages,
  sendMessage,
  addMessage,
} from '../../store/slices/chatSlice';
import ChatBubble from '../../components/chat/ChatBubble';
import MessageInput from '../../components/chat/MessageInput';
import Avatar from '../../components/common/Avatar';
import TypingIndicator from '../../components/chat/TypingIndicator';

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

export default function GroupChatScreen({ route, navigation }) {
  const { chatId, groupName, members } = route.params;
  const dispatch = useDispatch();
  const { socketService } = useSocket();
  const { user } = useSelector((state) => state.auth);
  const messages = useSelector((state) => state.chat.messages[chatId] || []);
  const typingUsers = useSelector(
    (state) => state.chat.typingUsers[chatId] || []
  );
  const flatListRef = useRef(null);

  useEffect(() => {
    dispatch(fetchMessages({ chatId }));
    socketService.joinChat(chatId);

    const handleNewMessage = (message) => {
      if (message.chatId === chatId) {
        dispatch(addMessage({ chatId, message }));
      }
    };

    socketService.onMessage(handleNewMessage);

    return () => {
      socketService.leaveChat(chatId);
      socketService.off('message', handleNewMessage);
    };
  }, [chatId]);

  const handleSend = async (content) => {
    const tempMessage = {
      id: Date.now().toString(),
      chatId,
      senderId: user.id,
      senderName: user.username,
      senderAvatar: user.avatar,
      content,
      type: 'text',
      createdAt: new Date().toISOString(),
      isRead: false,
    };

    dispatch(addMessage({ chatId, message: tempMessage }));

    try {
      await dispatch(
        sendMessage({ chatId, message: { content, type: 'text' } })
      ).unwrap();
    } catch (error) {
      console.error('Send message failed:', error);
    }
  };

  const handleVoicePress = () => {
    console.log('Voice recording...');
  };

  const handleImagePress = () => {
    console.log('Image picker...');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Group Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={THEME.text} />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <View style={styles.groupIconContainer}>
            <Users size={20} color={THEME.primary} />
          </View>
          <View style={styles.groupInfo}>
            <Text style={styles.groupName}>{groupName}</Text>
            <Text style={styles.membersCount}>
              {members?.length || 0} members
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => navigation.navigate('GroupInfo', { chatId, members })}
          style={styles.infoButton}
        >
          <Info size={22} color={THEME.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isOwn = item.senderId === user.id;
          return (
            <View style={styles.messageWrapper}>
              {!isOwn && (
                <View style={styles.senderInfo}>
                  <Avatar uri={item.senderAvatar} size={20} />
                  <Text style={styles.senderName}>{item.senderName}</Text>
                </View>
              )}
              <ChatBubble message={item} isOwn={isOwn} />
            </View>
          );
        }}
        contentContainerStyle={styles.messagesList}
        ListFooterComponent={
          typingUsers.length > 0 ? (
            <View style={styles.typingWrapper}>
              <View style={styles.typingAccentBar} />
              <View style={styles.typingContainer}>
                <Text style={styles.typingText}>
                  {typingUsers.length}{' '}
                  {typingUsers.length === 1 ? 'person is' : 'people are'}{' '}
                  typing...
                </Text>
                <TypingIndicator />
              </View>
            </View>
          ) : null
        }
        inverted={false}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />

      <MessageInput
        onSend={handleSend}
        onVoicePress={handleVoicePress}
        onImagePress={handleImagePress}
      />
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
    paddingVertical: 12,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupIconContainer: {
    backgroundColor: 'rgba(255, 99, 74, 0.15)',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    color: THEME.text,
    fontWeight: '700',
    fontSize: 18,
    marginBottom: 2,
  },
  membersCount: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  infoButton: {
    padding: 8,
    backgroundColor: 'rgba(255, 99, 74, 0.1)',
    borderRadius: 20,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageWrapper: {
    marginBottom: 16,
  },
  senderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    marginLeft: 4,
  },
  senderName: {
    color: THEME.textSecondary,
    fontSize: 12,
    marginLeft: 8,
    fontWeight: '600',
  },
  // Typing Indicator
  typingWrapper: {
    position: 'relative',
    marginTop: 8,
    marginHorizontal: 4,
  },
  typingAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    opacity: 0.4,
  },
  typingContainer: {
    backgroundColor: THEME.surface,
    padding: 12,
    paddingLeft: 16,
    borderRadius: 12,
  },
  typingText: {
    color: THEME.textSecondary,
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '500',
  },
});
