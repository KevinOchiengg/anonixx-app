import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  StatusBar,
  Dimensions,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { PlusCircle, Users } from 'lucide-react-native';
import { fetchGroups } from '../../store/slices/groupsSlice';
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

export default function GroupsScreen({ navigation }) {
  const dispatch = useDispatch();
  const { theme } = useTheme();
  const groups = useSelector((state) => state.groups?.groups || []);
  const loading = useSelector((state) => state.groups?.loading || false);

  useEffect(() => {
    console.log('🔵 GroupsScreen mounted, fetching groups...');
    dispatch(fetchGroups());
  }, []);

  const GroupCard = ({ group }) => (
    <View style={styles.groupCardWrapper}>
      <View style={styles.groupCardAccentBar} />
      <TouchableOpacity
        onPress={() =>
          navigation.navigate('GroupDetail', { groupId: group.id })
        }
        style={styles.groupCard}
        activeOpacity={0.8}
      >
        <View style={styles.groupIcon}>
          <Users size={28} color={THEME.primary} />
        </View>
        <View style={styles.groupInfo}>
          <Text style={styles.groupName}>{group.name}</Text>
          <Text style={styles.groupDescription} numberOfLines={2}>
            {group.description}
          </Text>
          <View style={styles.divider} />
          <View style={styles.groupStats}>
            <View style={styles.stat}>
              <Users size={14} color={THEME.textSecondary} />
              <Text style={styles.groupStat}>
                {group.members_count || 0} members
              </Text>
            </View>
            <Text style={styles.statSeparator}>•</Text>
            <Text style={styles.groupStat}>{group.posts_count || 0} posts</Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );

  if (loading && (!groups || groups.length === 0)) {
    return (
      <View style={styles.centered}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={THEME.background}
        />
        <StarryBackground />
        <ActivityIndicator size="large" color={THEME.primary} />
        <Text style={styles.loadingText}>Loading groups...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Groups</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('CreateGroup')}
          style={styles.createButton}
        >
          <PlusCircle size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <GroupCard group={item} />}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => dispatch(fetchGroups())}
            tintColor={THEME.primary}
            colors={[THEME.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Users size={64} color={THEME.textSecondary} opacity={0.3} />
            </View>
            <Text style={styles.emptyText}>
              No groups yet. Create one to get started!
            </Text>
            <View style={styles.emptyButtonWrapper}>
              <View style={styles.emptyButtonAccentBar} />
              <TouchableOpacity
                onPress={() => navigation.navigate('CreateGroup')}
                style={styles.emptyButton}
              >
                <PlusCircle size={18} color="#ffffff" />
                <Text style={styles.emptyButtonText}>Create Group</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        contentContainerStyle={
          !groups || groups.length === 0 ? styles.emptyList : styles.listContent
        }
        showsVerticalScrollIndicator={false}
      />
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
    marginTop: 16,
    fontSize: 15,
    color: THEME.textSecondary,
    fontStyle: 'italic',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: THEME.primary,
    letterSpacing: -0.5,
  },
  createButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 20,
  },
  // Group Card
  groupCardWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  groupCardAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.6,
    zIndex: 1,
  },
  groupCard: {
    flexDirection: 'row',
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
  groupIcon: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 99, 74, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 6,
  },
  groupDescription: {
    fontSize: 14,
    color: THEME.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.border,
    marginBottom: 12,
  },
  groupStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  groupStat: {
    fontSize: 13,
    color: THEME.textSecondary,
    fontWeight: '500',
  },
  statSeparator: {
    fontSize: 13,
    color: THEME.textSecondary,
    marginHorizontal: 12,
  },
  // Empty State
  emptyList: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
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
    fontSize: 16,
    textAlign: 'center',
    color: THEME.textSecondary,
    marginBottom: 32,
    lineHeight: 24,
  },
  emptyButtonWrapper: {
    position: 'relative',
  },
  emptyButtonAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.8,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    paddingLeft: 32,
    borderRadius: 16,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  emptyButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
