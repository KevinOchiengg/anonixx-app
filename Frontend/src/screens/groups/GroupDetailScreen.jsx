import React, { useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
} from 'react-native'
import { useSelector, useDispatch } from 'react-redux'
import { ArrowLeft, Users, MessageCircle } from 'lucide-react-native'
import { fetchGroupDetail } from '../../store/slices/groupsSlice'
import { useTheme } from '../../context/ThemeContext'

export default function GroupDetailScreen({ route, navigation }) {
  const dispatch = useDispatch()
  const { theme } = useTheme()
  const { groupId } = route.params
  const { currentGroup, loading } = useSelector((state) => state.groups)

  useEffect(() => {
    dispatch(fetchGroupDetail(groupId))
  }, [groupId])

  const styles = createStyles(theme)

  if (loading || !currentGroup) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <StatusBar barStyle={theme.statusBar} />
        <ActivityIndicator size='large' color={theme.primary} />
      </View>
    )
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={theme.statusBar} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: theme.text }]}
          numberOfLines={1}
        >
          {currentGroup.name}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Group Info */}
        <View
          style={[
            styles.groupInfo,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <View
            style={[styles.groupIcon, { backgroundColor: theme.primaryLight }]}
          >
            <Users size={48} color={theme.primary} />
          </View>
          <Text style={[styles.groupName, { color: theme.text }]}>
            {currentGroup.name}
          </Text>
          <Text
            style={[styles.groupDescription, { color: theme.textSecondary }]}
          >
            {currentGroup.description}
          </Text>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={[styles.statNumber, { color: theme.text }]}>
                {currentGroup.members_count || 0}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                Members
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNumber, { color: theme.text }]}>
                {currentGroup.posts_count || 0}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                Posts
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.joinButton, { backgroundColor: theme.primary }]}
          >
            <Text style={styles.joinButtonText}>Join Group</Text>
          </TouchableOpacity>
        </View>

        {/* Posts Section */}
        <View style={styles.postsSection}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Recent Posts
          </Text>
          <View
            style={[
              styles.emptyState,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <MessageCircle size={48} color={theme.textTertiary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No posts yet. Be the first to post!
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    backButton: {
      padding: 8,
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: 'bold',
      marginHorizontal: 12,
    },
    scrollView: {
      flex: 1,
    },
    groupInfo: {
      margin: 16,
      padding: 24,
      borderRadius: 16,
      borderWidth: 1,
      alignItems: 'center',
    },
    groupIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    groupName: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 8,
      textAlign: 'center',
    },
    groupDescription: {
      fontSize: 16,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 22,
    },
    stats: {
      flexDirection: 'row',
      gap: 48,
      marginBottom: 24,
    },
    stat: {
      alignItems: 'center',
    },
    statNumber: {
      fontSize: 28,
      fontWeight: 'bold',
    },
    statLabel: {
      fontSize: 14,
      marginTop: 4,
    },
    joinButton: {
      paddingHorizontal: 32,
      paddingVertical: 12,
      borderRadius: 20,
    },
    joinButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    postsSection: {
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 16,
    },
    emptyState: {
      padding: 48,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 16,
      marginTop: 16,
      textAlign: 'center',
    },
  })
