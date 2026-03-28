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
import { PlusCircle } from 'lucide-react-native'
import PostCard from '../../components/feed/PostCard'
import { fetchFeed } from '../../store/slices/postsSlice'
import { useTheme } from '../../context/ThemeContext'
import StarryBackground from '../../components/common/StarryBackground';

export default function FeedScreen({ navigation }) {
  const dispatch = useDispatch()
  const { theme } = useTheme()
  const { feed, loading } = useSelector((state) => state.posts)

  useEffect(() => {
    loadFeed()
  }, [])

  const loadFeed = () => {
    dispatch(fetchFeed())
  }

  const styles = createStyles(theme)

  if (loading && feed.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
      <StarryBackground />
        <StatusBar barStyle={theme.statusBar} />
        <ActivityIndicator size='large' color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading feed...
        </Text>
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
        <Text style={[styles.headerTitle, { color: theme.text }]}>Feed</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('CreatePost')}
          style={[styles.createButton, { backgroundColor: theme.primary }]}
        >
          <PlusCircle size={20} color='#ffffff' />
        </TouchableOpacity>
      </View>

      {/* Feed List */}
      <FlatList
        data={feed}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onPress={() =>
              navigation.navigate('PostDetail', { postId: item.id })
            }
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadFeed}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No posts yet. Be the first to share!
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('CreatePost')}
              style={[styles.emptyButton, { backgroundColor: theme.primary }]}
            >
              <Text style={styles.emptyButtonText}>Create Post</Text>
            </TouchableOpacity>
          </View>
        }
        contentContainerStyle={feed.length === 0 && styles.emptyList}
      />
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
