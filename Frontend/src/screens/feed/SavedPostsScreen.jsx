import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  RefreshControl,
  Vibration,
} from 'react-native';
import { ArrowLeft, Heart, Calendar, Bookmark } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
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

export default function SavedPostsScreen({ navigation }) {
  const { theme } = useTheme();
  const [savedPosts, setSavedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadSavedPosts();
  }, []);

  const loadSavedPosts = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/v1/posts/saved`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setSavedPosts(data.saved_posts);
      }
    } catch (error) {
      console.error('❌ Load saved posts error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Vibration.vibrate(10); // Haptic feedback
    loadSavedPosts();
  }, []);

  const handlePostPress = (post) => {
    Vibration.vibrate(10);
    navigation.navigate('PostDetail', { post });
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
        <Text style={styles.headerTitle}>Saved Thoughts</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={THEME.primary} />
          <Text style={styles.loadingText}>Loading your saved thoughts...</Text>
        </View>
      ) : savedPosts.length === 0 ? (
        <View style={styles.centered}>
          <View style={styles.emptyIconContainer}>
            <Bookmark size={64} color={THEME.primary} />
          </View>
          <Text style={styles.emptyText}>No saved thoughts yet</Text>
          <Text style={styles.emptySubtext}>
            Save posts to revisit when you need comfort.
          </Text>
          <Text style={styles.emptyHint}>
            Tap the bookmark icon on any post to save it here.
          </Text>
        </View>
      ) : (
        <>
          {/* Stats Header */}
          <View style={styles.statsWrapper}>
            <View style={styles.statsAccentBar} />
            <View style={styles.statsCard}>
              <View style={styles.statItem}>
                <Heart size={20} color={THEME.primary} />
                <Text style={styles.statValue}>{savedPosts.length}</Text>
                <Text style={styles.statLabel}>
                  Saved {savedPosts.length === 1 ? 'Thought' : 'Thoughts'}
                </Text>
              </View>
            </View>
          </View>

          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={THEME.primary}
                colors={[THEME.primary]}
              />
            }
          >
            <View style={styles.postsContainer}>
              {savedPosts.map((post) => (
                <View key={post.id} style={styles.postCardWrapper}>
                  <View style={styles.postAccentBar} />
                  <TouchableOpacity
                    onPress={() => handlePostPress(post)}
                    style={styles.postCard}
                    activeOpacity={0.8}
                  >
                    <View style={styles.postHeader}>
                      <View style={styles.savedBadge}>
                        <Bookmark
                          size={14}
                          color={THEME.primary}
                          fill={THEME.primary}
                        />
                        <Text style={styles.savedBadgeText}>Saved</Text>
                      </View>
                      <View style={styles.postDate}>
                        <Calendar size={14} color={THEME.textSecondary} />
                        <Text style={styles.postDateText}>
                          {post.saved_days_ago === 0
                            ? 'Today'
                            : post.saved_days_ago === 1
                              ? 'Yesterday'
                              : `${post.saved_days_ago} days ago`}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.divider} />

                    <Text style={styles.postContent} numberOfLines={6}>
                      {post.content}
                    </Text>

                    {post.content.length > 200 && (
                      <Text style={styles.readMore}>Tap to read more</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>
        </>
      )}
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
    paddingHorizontal: 40,
  },
  loadingText: {
    fontSize: 15,
    color: THEME.textSecondary,
    marginTop: 16,
    fontStyle: 'italic',
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 99, 74, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyText: {
    fontSize: 22,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 15,
    color: THEME.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  emptyHint: {
    fontSize: 13,
    color: THEME.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
    opacity: 0.7,
  },
  // Stats Header
  statsWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  statsAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.6,
  },
  statsCard: {
    backgroundColor: THEME.surface,
    padding: 18,
    paddingLeft: 22,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: THEME.primary,
  },
  statLabel: {
    fontSize: 15,
    color: THEME.text,
    fontWeight: '500',
  },
  // Posts List
  scrollView: {
    flex: 1,
  },
  postsContainer: {
    padding: 16,
  },
  postCardWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  postAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.6,
  },
  postCard: {
    backgroundColor: THEME.surface,
    padding: 18,
    paddingLeft: 22,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 99, 74, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  savedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.primary,
  },
  postDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  postDateText: {
    fontSize: 13,
    color: THEME.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.border,
    marginBottom: 14,
  },
  postContent: {
    fontSize: 16,
    lineHeight: 26,
    color: THEME.text,
    letterSpacing: 0.2,
  },
  readMore: {
    fontSize: 14,
    fontWeight: '500',
    color: THEME.primary,
    marginTop: 10,
  },
});
