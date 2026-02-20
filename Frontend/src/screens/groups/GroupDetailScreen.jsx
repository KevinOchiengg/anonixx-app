import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Dimensions,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { ArrowLeft, Users, MessageCircle } from 'lucide-react-native';
import { fetchGroupDetail } from '../../store/slices/groupsSlice';
import { useTheme } from '../../context/ThemeContext';

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

export default function GroupDetailScreen({ route, navigation }) {
  const dispatch = useDispatch();
  const { theme } = useTheme();
  const { groupId } = route.params;
  const { currentGroup, loading } = useSelector((state) => state.groups);

  useEffect(() => {
    dispatch(fetchGroupDetail(groupId));
  }, [groupId]);

  if (loading || !currentGroup) {
    return (
      <View style={styles.centered}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={THEME.background}
        />
        <StarryBackground />
        <ActivityIndicator size="large" color={THEME.primary} />
        <Text style={styles.loadingText}>Loading group...</Text>
      </View>
    );
  }

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
        <Text style={styles.headerTitle} numberOfLines={1}>
          {currentGroup.name}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Group Info Card */}
        <View style={styles.groupInfoWrapper}>
          <View style={styles.groupInfoAccentBar} />
          <View style={styles.groupInfo}>
            <View style={styles.groupIcon}>
              <Users size={48} color={THEME.primary} />
            </View>

            <Text style={styles.groupName}>{currentGroup.name}</Text>

            <Text style={styles.groupDescription}>
              {currentGroup.description}
            </Text>

            <View style={styles.divider} />

            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>
                  {currentGroup.members_count || 0}
                </Text>
                <Text style={styles.statLabel}>Members</Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.stat}>
                <Text style={styles.statNumber}>
                  {currentGroup.posts_count || 0}
                </Text>
                <Text style={styles.statLabel}>Posts</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.joinButton}>
              <Text style={styles.joinButtonText}>Join Group</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Posts Section */}
        <View style={styles.postsSection}>
          <Text style={styles.sectionTitle}>Recent Posts</Text>

          <View style={styles.emptyStateWrapper}>
            <View style={styles.emptyAccentBar} />
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <MessageCircle
                  size={48}
                  color={THEME.textSecondary}
                  opacity={0.3}
                />
              </View>
              <Text style={styles.emptyText}>
                No posts yet. Be the first to post!
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: THEME.background,
  },
  loadingText: {
    fontSize: 15,
    color: THEME.textSecondary,
    marginTop: 16,
    fontStyle: 'italic',
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
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: THEME.text,
    marginHorizontal: 12,
  },
  scrollView: {
    flex: 1,
  },
  // Group Info Card
  groupInfoWrapper: {
    position: 'relative',
    margin: 16,
    marginBottom: 8,
  },
  groupInfoAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    opacity: 0.6,
  },
  groupInfo: {
    backgroundColor: THEME.surface,
    padding: 24,
    paddingLeft: 28,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  groupIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 99, 74, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  groupName: {
    fontSize: 26,
    fontWeight: '800',
    color: THEME.text,
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  groupDescription: {
    fontSize: 16,
    textAlign: 'center',
    color: THEME.textSecondary,
    marginBottom: 20,
    lineHeight: 24,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: THEME.border,
    marginVertical: 20,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 48,
  },
  stat: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: THEME.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: THEME.textSecondary,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: THEME.border,
  },
  joinButton: {
    backgroundColor: THEME.primary,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  joinButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Posts Section
  postsSection: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 16,
    marginLeft: 4,
  },
  emptyStateWrapper: {
    position: 'relative',
  },
  emptyAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.4,
  },
  emptyState: {
    backgroundColor: THEME.surface,
    padding: 48,
    paddingLeft: 52,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 99, 74, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 15,
    color: THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
