import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
} from 'react-native'
import { ArrowLeft } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '../../context/ThemeContext'

export default function SavedPostsScreen({ navigation }) {
  const { theme } = useTheme()
  const [savedPosts, setSavedPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSavedPosts()
  }, [])

  const loadSavedPosts = async () => {
    try {
      const token = await AsyncStorage.getItem('token')
      const response = await fetch('http://localhost:8000/api/v1/posts/saved', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json()

      if (response.ok) {
        setSavedPosts(data.saved_posts)
      }
    } catch (error) {
      console.error('❌ Load saved posts error:', error)
    } finally {
      setLoading(false)
    }
  }

  const styles = createStyles(theme)

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={theme.statusBar} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Saved Thoughts
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size='large' color={theme.primary} />
        </View>
      ) : savedPosts.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No saved thoughts yet.
          </Text>
          <Text style={[styles.emptySubtext, { color: theme.textTertiary }]}>
            Save posts to revisit when you need comfort.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView}>
          <View style={styles.postsContainer}>
            {savedPosts.map((post) => (
              <View
                key={post.id}
                style={[styles.postCard, { backgroundColor: theme.card }]}
              >
                <Text style={[styles.postContent, { color: theme.text }]}>
                  {post.content}
                </Text>
                <Text style={[styles.postMeta, { color: theme.textSecondary }]}>
                  Saved{' '}
                  {post.saved_days_ago === 0
                    ? 'today'
                    : `${post.saved_days_ago} days ago`}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: 'bold',
    },
    scrollView: {
      flex: 1,
    },
    postsContainer: {
      padding: 16,
      gap: 16,
    },
    postCard: {
      padding: 20,
      borderRadius: 16,
    },
    postContent: {
      fontSize: 16,
      lineHeight: 24,
      marginBottom: 12,
    },
    postMeta: {
      fontSize: 13,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 40,
    },
    emptyText: {
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 8,
      textAlign: 'center',
    },
    emptySubtext: {
      fontSize: 14,
      textAlign: 'center',
    },
  })
