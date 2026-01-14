import React from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  SafeAreaView,
  StyleSheet,
} from 'react-native'
import { MessageCircle } from 'lucide-react-native'
import { useSelector } from 'react-redux'

export default function MatchesScreen({ navigation }) {
  const { matches } = useSelector((state) => state.dating)

  const renderMatch = ({ item }) => (
    <View style={styles.matchCard}>
      <Image
        source={{ uri: item.profile.photos[0] }}
        style={styles.matchImage}
      />
      <View style={styles.matchInfo}>
        <Text style={styles.matchName}>{item.profile.name}</Text>
        <Text style={styles.matchTime}>Matched {item.matchedAt}</Text>
      </View>
      <TouchableOpacity
        onPress={() => navigation.navigate('Chat', { chatId: item.chatId })}
        style={styles.messageButton}
      >
        <MessageCircle size={24} color='#a855f7' />
      </TouchableOpacity>
    </View>
  )

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Matches</Text>
        <Text style={styles.matchCount}>{matches.length} matches</Text>
      </View>

      <FlatList
        data={matches}
        keyExtractor={(item) => item.id}
        renderItem={renderMatch}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No matches yet</Text>
            <Text style={styles.emptySubtext}>
              Keep swiping to find your match!
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
  matchCount: { color: '#9ca3af', fontSize: 14 },
  listContent: { padding: 16 },
  matchCard: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  matchImage: { width: 60, height: 60, borderRadius: 30, marginRight: 16 },
  matchInfo: { flex: 1 },
  matchName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  matchTime: { fontSize: 12, color: '#9ca3af' },
  messageButton: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    padding: 12,
    borderRadius: 24,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 8,
  },
  emptySubtext: { fontSize: 14, color: '#6b7280' },
})
