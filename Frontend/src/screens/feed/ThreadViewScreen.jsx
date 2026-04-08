import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { ArrowLeft, Send } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';

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

export default function ThreadViewScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();
  const { postId, postContent } = route.params;
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [isClosed, setIsClosed] = useState(false);

  useEffect(() => {
    loadThreads();
  }, []);

  const loadThreads = async () => {
    try {
      const token = await AsyncStorage.getItem('token');

      console.log('🔍 Thread - Token exists:', !!token);
      console.log('🔍 Thread - Token type:', typeof token);
      console.log('🔍 Thread - Token preview:', token?.substring(0, 30));

      const headers = {};
      if (token && typeof token === 'string' && token.length > 10) {
        headers['Authorization'] = `Bearer ${token}`;
      } else if (isAuthenticated) {
        console.error('❌ Invalid token despite isAuthenticated=true');
        Alert.alert('Session Expired', 'Please log in again to continue', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
          },
        ]);
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/v1/posts/${postId}/thread`,
        { headers }
      );

      console.log('🔍 Thread response status:', response.status);

      const data = await response.json();

      if (response.ok) {
        setThreads(data.threads);
        setIsClosed(data.is_closed);
      } else if (response.status === 401) {
        console.error('❌ Thread 401:', data);
        Alert.alert('Session Expired', 'Please log in again', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
          },
        ]);
      } else {
        console.error('❌ Thread load failed:', data);
      }
    } catch (error) {
      console.error('❌ Load threads error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendReply = async () => {
    if (!isAuthenticated) {
      Alert.alert('Sign in Required', 'Please sign in to reply to posts', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign In',
          onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
        },
      ]);
      return;
    }

    if (!replyText.trim()) {
      Alert.alert('Error', 'Please write something');
      return;
    }

    if (isClosed) {
      Alert.alert('Thread Closed', 'This thread has reached its 2-reply limit');
      return;
    }

    setSending(true);
    try {
      const token = await AsyncStorage.getItem('token');

      console.log('🔍 Reply - Token exists:', !!token);
      console.log('🔍 Reply - Token type:', typeof token);

      if (!token || typeof token !== 'string' || token.length < 10) {
        Alert.alert('Session Expired', 'Please log in again', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
          },
        ]);
        setSending(false);
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/v1/posts/${postId}/thread`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: replyText.trim(),
          }),
        }
      );

      console.log('🔍 Reply response status:', response.status);

      const data = await response.json();

      if (response.ok) {
        Alert.alert('Success', data.message);
        setReplyText('');
        loadThreads();

        if (data.thread_closed) {
          setIsClosed(true);
        }
      } else if (response.status === 401) {
        Alert.alert('Session Expired', 'Please log in again', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Auth', { screen: 'Login' }),
          },
        ]);
      } else {
        Alert.alert('Error', data.detail || 'Failed to post reply');
      }
    } catch (error) {
      console.error('❌ Send reply error:', error);
      Alert.alert('Error', 'Failed to post reply');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color={THEME.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Thread</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={THEME.primary} />
          </View>
        ) : (
          <>
            <ScrollView
              style={styles.scrollView}
              showsVerticalScrollIndicator={false}
            >
              {/* Original Post */}
              <View style={styles.originalPostWrapper}>
                <View style={styles.accentBar} />
                <View style={styles.originalPost}>
                  <Text style={styles.originalLabel}>Original Post</Text>
                  <Text style={styles.originalContent}>{postContent}</Text>
                </View>
              </View>

              {/* Thread Replies */}
              {threads.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>
                    {isAuthenticated
                      ? 'No replies yet. Be the first to respond.'
                      : 'No replies yet. Sign in to start a conversation.'}
                  </Text>
                </View>
              ) : (
                <View style={styles.threadsContainer}>
                  {threads.map((thread, index) => (
                    <View
                      key={thread.id}
                      style={[
                        styles.threadCardWrapper,
                        { marginLeft: thread.depth * 20 },
                      ]}
                    >
                      <View style={styles.threadAccentBar} />
                      <View
                        style={[
                          styles.threadCard,
                          thread.is_own_reply && styles.ownReplyCard,
                        ]}
                      >
                        <View style={styles.threadHeader}>
                          <Text
                            style={[
                              styles.threadAuthor,
                              thread.is_own_reply && styles.ownReplyAuthor,
                            ]}
                          >
                            {thread.is_own_reply
                              ? 'You'
                              : thread.anonymous_name}
                          </Text>
                          <Text style={styles.threadTime}>
                            {thread.time_ago}
                          </Text>
                        </View>
                        <Text style={styles.threadContent}>
                          {thread.content}
                        </Text>
                      </View>
                    </View>
                  ))}

                  {isClosed && (
                    <View style={styles.closedBanner}>
                      <Text style={styles.closedText}>
                        Thread closed - Preserved for reading
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            {/* Reply Input */}
            {!isClosed && (
              <View style={styles.replyContainer}>
                <TextInput
                  value={replyText}
                  onChangeText={setReplyText}
                  placeholder={
                    isAuthenticated
                      ? 'Write your reply...'
                      : 'Sign in to reply...'
                  }
                  placeholderTextColor={THEME.textSecondary}
                  multiline
                  editable={isAuthenticated}
                  style={[
                    styles.replyInput,
                    { opacity: isAuthenticated ? 1 : 0.6 },
                  ]}
                  maxLength={500}
                />
                <TouchableOpacity
                  onPress={handleSendReply}
                  disabled={sending || !replyText.trim()}
                  style={[
                    styles.sendButton,
                    {
                      backgroundColor: replyText.trim()
                        ? THEME.primary
                        : THEME.border,
                    },
                  ]}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Send size={20} color="#ffffff" />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
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
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: THEME.text,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  // Original Post Card
  originalPostWrapper: {
    position: 'relative',
    margin: 16,
    marginBottom: 24,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    zIndex: 1,
  },
  originalPost: {
    backgroundColor: THEME.surface,
    padding: 22,
    paddingLeft: 28,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 10,
  },
  originalLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    color: THEME.primary,
    letterSpacing: 1,
  },
  originalContent: {
    fontSize: 17,
    lineHeight: 27,
    color: THEME.text,
    letterSpacing: 0.2,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    color: THEME.textSecondary,
    fontStyle: 'italic',
  },
  threadsContainer: {
    padding: 16,
    gap: 16,
  },
  // Thread Reply Cards
  threadCardWrapper: {
    position: 'relative',
  },
  threadAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    opacity: 0.6,
  },
  threadCard: {
    backgroundColor: THEME.surface,
    padding: 18,
    paddingLeft: 22,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  ownReplyCard: {
    backgroundColor: 'rgba(255, 99, 74, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 99, 74, 0.15)',
  },
  threadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  threadAuthor: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME.text,
  },
  ownReplyAuthor: {
    color: THEME.primary,
  },
  threadTime: {
    fontSize: 13,
    color: THEME.textSecondary,
  },
  threadContent: {
    fontSize: 16,
    lineHeight: 24,
    color: THEME.text,
    letterSpacing: 0.2,
  },
  closedBanner: {
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: 'rgba(255, 99, 74, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 99, 74, 0.15)',
  },
  closedText: {
    fontSize: 14,
    fontWeight: '500',
    fontStyle: 'italic',
    color: THEME.textSecondary,
  },
  // Reply Input
  replyContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    gap: 12,
    backgroundColor: THEME.surface,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  replyInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: THEME.text,
    backgroundColor: THEME.input,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
