import React, { useEffect } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  SafeAreaView,
  StyleSheet,
} from 'react-native'
import { useDispatch, useSelector } from 'react-redux'
import { fetchChats } from '../../store/slices/chatSlice'

export default function ChatsListScreen({ navigation }) {
  const dispatch = useDispatch()
  const { chats, loading } = useSelector((state) => state.chat)

  useEffect(() => {
    dispatch(fetchChats())
  }, [])

  const renderChat = ({ item }) => (
    <TouchableOpacity
      onPress={() =>
        navigation.navigate('Chat', {
          chatId: item.id,
          recipientName: item.recipientName,
        })
      }
      style={styles.chatCard}
    >
      <Image source={{ uri: item.recipientAvatar }} style={styles.avatar} />
      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <Text style={styles.recipientName}>{item.recipientName}</Text>
          <Text style={styles.timestamp}>{item.lastMessageTime}</Text>
        </View>
        <Text style={styles.lastMessage} numberOfLines={1}>
          {item.lastMessage}
        </Text>
      </View>
      {item.unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadText}>{item.unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  )

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        renderItem={renderChat}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>Start a conversation!</Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
  listContent: { paddingTop: 8 },
  chatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  avatar: { width: 56, height: 56, borderRadius: 28, marginRight: 12 },
  chatInfo: { flex: 1 },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  recipientName: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  timestamp: { fontSize: 12, color: '#6b7280' },
  lastMessage: { fontSize: 14, color: '#9ca3af' },
  unreadBadge: {
    backgroundColor: '#a855f7',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  unreadText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },
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
