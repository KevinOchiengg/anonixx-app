import React, { useEffect } from 'react'
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
} from 'react-native'
import { useSelector, useDispatch } from 'react-redux'
import { PlusCircle, Users } from 'lucide-react-native'
import { fetchGroups } from '../../store/slices/groupsSlice'
import { useTheme } from '../../context/ThemeContext'

export default function GroupsScreen({ navigation }) {
  const dispatch = useDispatch()
  const { theme } = useTheme()
  const groups = useSelector((state) => state.groups?.groups || [])
  const loading = useSelector((state) => state.groups?.loading || false)

  useEffect(() => {
    console.log('🔵 GroupsScreen mounted, fetching groups...')
    dispatch(fetchGroups())
  }, [])

  const GroupCard = ({ group }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('GroupDetail', { groupId: group.id })}
      style={[
        styles.groupCard,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
      activeOpacity={0.7}
    >
      <View style={[styles.groupIcon, { backgroundColor: theme.primaryLight }]}>
        <Users size={28} color={theme.primary} />
      </View>
      <View style={styles.groupInfo}>
        <Text style={[styles.groupName, { color: theme.text }]}>
          {group.name}
        </Text>
        <Text
          style={[styles.groupDescription, { color: theme.textSecondary }]}
          numberOfLines={2}
        >
          {group.description}
        </Text>
        <View style={styles.groupStats}>
          <Text style={[styles.groupStat, { color: theme.textSecondary }]}>
            👥 {group.members_count || 0} members
          </Text>
          <Text style={[styles.groupStat, { color: theme.textSecondary }]}>
            💬 {group.posts_count || 0} posts
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  )

  if (loading && (!groups || groups.length === 0)) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <StatusBar barStyle={theme.statusBar} />
        <ActivityIndicator size='large' color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading groups...
        </Text>
      </View>
    )
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={theme.statusBar} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Groups</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('CreateGroup')}
          style={[styles.createButton, { backgroundColor: theme.primary }]}
        >
          <PlusCircle size={20} color='#ffffff' />
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
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Users size={64} color={theme.textTertiary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No groups yet. Create one to get started!
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('CreateGroup')}
              style={[styles.emptyButton, { backgroundColor: theme.primary }]}
            >
              <Text style={styles.emptyButtonText}>Create Group</Text>
            </TouchableOpacity>
          </View>
        }
        contentContainerStyle={
          !groups || groups.length === 0 ? styles.emptyList : null
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  createButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  groupIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  groupDescription: {
    fontSize: 14,
    marginBottom: 8,
    lineHeight: 20,
  },
  groupStats: {
    flexDirection: 'row',
    marginTop: 4,
  },
  groupStat: {
    fontSize: 13,
    marginRight: 16,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  emptyButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
})
