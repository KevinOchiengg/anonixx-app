import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Alert,
  Dimensions,
  Text,
  TouchableOpacity,
} from 'react-native';
import { LogIn, LogOut, Search } from 'lucide-react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useLogout } from '../../hooks/useLogout';
import CalmPostCard from '../../components/feed/CalmPostCard';
import FeedDivider from '../../components/feed/FeedDivider';
import MoodBalancer from '../../components/feed/MoodBalancer';
import AuthPromptModal from '../../components/modals/AuthPromptModal';
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
};

// Starry Background Component - PARTICLES ONLY
const StarryBackground = () => {
  // Generate random star positions
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
      {/* Starry Particles Only */}
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

export default function CalmFeedScreen({ navigation }) {
  const { theme } = useTheme();
  const { isAuthenticated, user, checkAuth } = useAuth();
  const { confirmLogout } = useLogout(navigation);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessionPosts, setSessionPosts] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [sessionLimitReached, setSessionLimitReached] = useState(false);
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [authModalAction, setAuthModalAction] = useState('default');
  const flatListRef = useRef(null);

  const styles = useMemo(() => createStyles(), []);

  useEffect(() => {
    loadFeed();
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkAuth();
      setPosts([]);
      setSessionPosts(0);
      loadFeed();
    }, [])
  );

  const loadFeed = async () => {
    if (loading && posts.length > 0) return;

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const headers = {};

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/v1/posts/calm-feed?session_posts=${sessionPosts}`,
        { headers }
      );

      const data = await response.json();

      if (response.ok) {
        if (data.message === 'session_limit') {
          setSessionLimitReached(true);
          setHasMore(data.has_more);
        } else {
          setPosts((prev) => [...prev, ...data.posts]);
          setSessionPosts(data.session_posts);
          setHasMore(data.has_more);
        }
      }
    } catch (error) {
      console.error('❌ Load feed error:', error);
    } finally {
      setLoading(false);
    }
  };

  const showAuthPrompt = useCallback((action) => {
    setAuthModalAction(action);
    setAuthModalVisible(true);
  }, []);

  const handleResponse = useCallback(
    async (postId, responseType) => {
      if (!isAuthenticated) {
        showAuthPrompt('respond');
        return;
      }

      try {
        const token = await AsyncStorage.getItem('token');

        if (!token || typeof token !== 'string' || token.length < 10) {
          Alert.alert('Session Expired', 'Please log in again', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Login',
              onPress: async () => {
                await AsyncStorage.clear();
                navigation.navigate('Auth', { screen: 'Login' });
              },
            },
          ]);
          return;
        }

        const response = await fetch(
          `${API_BASE_URL}/api/v1/posts/${postId}/respond`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ type: responseType }),
          }
        );

        const data = await response.json();

        if (response.ok) {
          setPosts((prev) =>
            prev.map((item) =>
              item.type === 'post' && item.id === postId
                ? { ...item, user_response: responseType }
                : item
            )
          );
        } else {
          if (response.status === 401) {
            Alert.alert('Session Expired', 'Please log in again', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Login',
                onPress: async () => {
                  await AsyncStorage.clear();
                  navigation.navigate('Auth', { screen: 'Login' });
                },
              },
            ]);
          } else {
            Alert.alert('Error', data.detail || 'Failed to record response');
          }
        }
      } catch (error) {
        console.error('❌ Response error:', error);
        Alert.alert('Error', 'Failed to record response');
      }
    },
    [isAuthenticated, navigation, showAuthPrompt]
  );

  const handleSave = useCallback(
    async (postId) => {
      if (!isAuthenticated) {
        showAuthPrompt('save');
        return;
      }

      try {
        const token = await AsyncStorage.getItem('token');
        const response = await fetch(
          `${API_BASE_URL}/api/v1/posts/${postId}/save`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await response.json();

        if (response.ok) {
          setPosts((prev) =>
            prev.map((item) =>
              item.type === 'post' && item.id === postId
                ? { ...item, is_saved: data.saved }
                : item
            )
          );

          if (data.saved) {
            Alert.alert('Saved', 'Added to your collection');
          }
        }
      } catch (error) {
        console.error('❌ Save error:', error);
      }
    },
    [isAuthenticated, showAuthPrompt]
  );

  const handleViewThread = useCallback(
    async (postId) => {
      try {
        const token = await AsyncStorage.getItem('token');

        await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/view`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).catch((err) => console.log('View tracking failed:', err));

        const post = posts.find((p) => p.type === 'post' && p.id === postId);
        if (post) {
          navigation.navigate('ThreadView', {
            postId: postId,
            postContent: post.content,
          });
        }
      } catch (error) {
        console.error('❌ View thread error:', error);
      }
    },
    [posts, navigation]
  );

  const handlePostPress = useCallback(
    (post) => {
      navigation.navigate('PostDetail', { post });
    },
    [navigation]
  );

  const handleContinue = useCallback(() => {
    setSessionLimitReached(false);
    loadFeed();
  }, []);

  const handleAuthModalSignUp = useCallback(() => {
    setAuthModalVisible(false);
    navigation.navigate('Auth', { screen: 'Register' });
  }, [navigation]);

  const handleAuthModalLogin = useCallback(() => {
    setAuthModalVisible(false);
    navigation.navigate('Auth', { screen: 'Login' });
  }, [navigation]);

  const handleHeaderAuthAction = useCallback(() => {
    if (isAuthenticated) {
      confirmLogout();
    } else {
      navigation.navigate('Auth', { screen: 'Login' });
    }
  }, [isAuthenticated, confirmLogout, navigation]);

  const renderItem = useCallback(
    ({ item }) => {
      if (item.type === 'divider') {
        return <FeedDivider text={item.text} />;
      }

      if (item.type === 'mood_balancer') {
        return <MoodBalancer text={item.text} />;
      }

      if (item.type === 'post') {
        return (
          <CalmPostCard
            post={item}
            onResponse={handleResponse}
            onSave={handleSave}
            onViewThread={handleViewThread}
            onPress={handlePostPress}
            navigation={navigation}
          />
        );
      }

      return null;
    },
    [handleResponse, handleSave, handleViewThread, handlePostPress, navigation]
  );

  const keyExtractor = useCallback(
    (item, index) => `${item.id || item.type}-${index}`,
    []
  );

  const renderFooter = useMemo(() => {
    if (!loading || !hasMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator color={THEME.primary} />
      </View>
    );
  }, [loading, hasMore]);

  const handleEndReached = useCallback(() => {
    if (hasMore && !loading) {
      loadFeed();
    }
  }, [hasMore, loading]);

  if (loading && posts.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={THEME.background}
        />
        <StarryBackground />

        <View style={styles.centered}>
          <View style={styles.loadingContent}>
            <View style={styles.loadingLine} />
            <Text style={styles.loadingText}>
              Finding thoughts you need to hear...
            </Text>
            <View style={styles.loadingLine} />
          </View>
        </View>
      </View>
    );
  }

  if (sessionLimitReached) {
    return (
      <View style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={THEME.background}
        />
        <StarryBackground />

        <View style={styles.centered}>
          <View style={styles.limitContent}>
            <Text style={styles.limitTitle}>You've read enough for now.</Text>

            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
            </View>

            <Text style={styles.limitSubtitle}>
              Sometimes the best thing is to sit with what you've already felt.
            </Text>

            <Text style={styles.limitMessage}>
              Come back when you're ready.
            </Text>

            <View style={styles.limitButtons}>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={styles.limitButtonSecondary}
              >
                <Text style={styles.limitButtonSecondaryText}>Close</Text>
              </TouchableOpacity>

              {hasMore && (
                <TouchableOpacity
                  onPress={handleContinue}
                  style={styles.limitButtonPrimary}
                >
                  <Text style={styles.limitButtonPrimaryText}>
                    5 more posts
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Anonixx</Text>

        <View style={styles.headerActions}>
          {/* Search Button */}
          <TouchableOpacity
            onPress={() => navigation.navigate('Search')}
            style={styles.headerSearchButton}
          >
            <Search size={20} color={THEME.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleHeaderAuthAction}
            style={styles.headerAuthButton}
          >
            {isAuthenticated ? (
              <>
                <LogOut size={16} color={THEME.textSecondary} />
                <Text style={styles.headerAuthText}>Logout</Text>
              </>
            ) : (
              <>
                <LogIn size={16} color={THEME.textSecondary} />
                <Text style={styles.headerAuthText}>Login</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={posts}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        removeClippedSubviews={true}
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={100}
        initialNumToRender={5}
        windowSize={3}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.feedContent}
      />

      <AuthPromptModal
        visible={authModalVisible}
        onClose={() => setAuthModalVisible(false)}
        onSignUp={handleAuthModalSignUp}
        onLogin={handleAuthModalLogin}
        action={authModalAction}
      />
    </View>
  );
}

const createStyles = () =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: THEME.background,
    },
    // Header
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
      fontSize: 24,
      fontWeight: '800',
      color: THEME.primary,
      letterSpacing: -0.5,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerSearchButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255, 99, 74, 0.1)',
    },
    headerAuthButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: 'rgba(255, 99, 74, 0.1)',
    },
    headerAuthText: {
      fontSize: 13,
      fontWeight: '600',
      color: THEME.textSecondary,
    },
    feedContent: {
      paddingTop: 20,
      paddingBottom: 40,
    },
    // Loading State
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 40,
      zIndex: 5,
    },
    loadingContent: {
      alignItems: 'center',
      gap: 16,
    },
    loadingLine: {
      width: 80,
      height: 2,
      backgroundColor: THEME.primary,
      opacity: 0.3,
    },
    loadingText: {
      fontSize: 15,
      textAlign: 'center',
      fontStyle: 'italic',
      color: THEME.textSecondary,
    },
    // Session Limit State
    limitContent: {
      alignItems: 'center',
      width: '100%',
    },
    limitTitle: {
      fontSize: 24,
      fontWeight: '600',
      textAlign: 'center',
      marginBottom: 24,
      color: THEME.text,
    },
    dividerContainer: {
      width: '100%',
      alignItems: 'center',
      marginVertical: 24,
    },
    dividerLine: {
      width: 120,
      height: 1,
      backgroundColor: THEME.border,
    },
    limitSubtitle: {
      fontSize: 16,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 16,
      color: THEME.textSecondary,
    },
    limitMessage: {
      fontSize: 15,
      textAlign: 'center',
      marginBottom: 40,
      color: THEME.textSecondary,
    },
    limitButtons: {
      flexDirection: 'row',
      gap: 12,
      width: '100%',
    },
    limitButtonSecondary: {
      flex: 1,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: THEME.surface,
    },
    limitButtonSecondaryText: {
      fontSize: 16,
      fontWeight: '600',
      color: THEME.text,
    },
    limitButtonPrimary: {
      flex: 1,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: THEME.primary,
    },
    limitButtonPrimaryText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#fff',
    },
    footer: {
      height: 100,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
