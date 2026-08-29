/**
 * UnlockRequestsScreen
 *
 * The owner's review inbox for pending "unlock my confession" requests.
 * Grouped by confession — each group gets its own Accept All, since
 * approval is scoped per-confession, never account-wide. Nothing here was
 * charged yet; Accept is the first moment coins actually move
 * (Backend/app/api/v1/unlock_requests.py::accept_unlock_request).
 *
 * Optional route params { targetType, targetId } pre-scope the list to one
 * confession (used by the push-notification deep link).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image,
  SectionList, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VideoView, useVideoPlayer } from 'expo-video';

import { T } from '../../utils/colorTokens';
import { rs, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import DropScreenHeader from '../../components/drops/DropScreenHeader';
import { useToast } from '../../components/ui/Toast';
import { useSocket } from '../../context/SocketContext';
import { API_BASE_URL } from '../../config/api';

// Its own component so useVideoPlayer is only ever called once per row, not
// conditionally inside renderItem — same pattern as DropChatScreen's
// WelcomeGalleryPage.
function RequestMediaThumb({ mediaUrl, mediaType }) {
  const isVideo = mediaType === 'video';
  const player = useVideoPlayer(
    isVideo ? { uri: mediaUrl } : null,
    (p) => { p.loop = true; p.muted = true; p.play(); },
  );

  if (!mediaUrl) return null;

  return (
    <View style={s.thumbWrap}>
      {isVideo ? (
        <VideoView player={player} style={s.thumb} contentFit="cover" />
      ) : (
        <Image source={{ uri: mediaUrl }} style={s.thumb} />
      )}
    </View>
  );
}

export default function UnlockRequestsScreen({ route, navigation }) {
  const { targetType, targetId } = route.params ?? {};
  const { showToast } = useToast();
  const { socketService } = useSocket();

  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyIds, setBusyIds] = useState(new Set());

  const load = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const qs = targetType && targetId
        ? `?target_type=${encodeURIComponent(targetType)}&target_id=${encodeURIComponent(targetId)}`
        : '';
      const res = await fetch(`${API_BASE_URL}/api/v1/unlock-requests/incoming${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const requests = data?.requests || [];

      const grouped = new Map();
      requests.forEach((r) => {
        const key = `${r.target_type}:${r.target_id}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            key,
            target_type: r.target_type,
            target_id: r.target_id,
            title: r.confession_snippet || 'A confession',
            data: [],
          });
        }
        grouped.get(key).data.push(r);
      });
      setSections(Array.from(grouped.values()));
    } catch {
      showToast({ type: 'error', message: 'Could not load requests.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [targetType, targetId, showToast]);

  useEffect(() => { load(); }, [load]);

  // Live updates — a fresh request or a withdrawn one just triggers a refetch
  // rather than hand-patching local groups, which keeps grouping correct.
  useEffect(() => {
    if (!socketService) return;
    const handleChange = () => load();
    socketService.on?.('unlock_request_received', handleChange);
    socketService.on?.('unlock_request_cancelled', handleChange);
    return () => {
      socketService.off?.('unlock_request_received', handleChange);
      socketService.off?.('unlock_request_cancelled', handleChange);
    };
  }, [socketService, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const removeRequest = useCallback((requestId) => {
    setSections((prev) => prev
      .map((sec) => ({ ...sec, data: sec.data.filter((r) => r.id !== requestId) }))
      .filter((sec) => sec.data.length > 0));
  }, []);

  const handleAccept = useCallback(async (requestId) => {
    setBusyIds((prev) => new Set(prev).add(requestId));
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/unlock-requests/${requestId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        showToast({ type: 'success', message: 'Accepted — chat started.' });
        removeRequest(requestId);
      } else {
        showToast({ type: 'warning', message: data.detail || 'Could not accept right now.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong.' });
    } finally {
      setBusyIds((prev) => { const s = new Set(prev); s.delete(requestId); return s; });
    }
  }, [showToast, removeRequest]);

  const handleDecline = useCallback(async (requestId) => {
    setBusyIds((prev) => new Set(prev).add(requestId));
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/unlock-requests/${requestId}/decline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        removeRequest(requestId);
      } else {
        showToast({ type: 'error', message: 'Could not decline right now.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong.' });
    } finally {
      setBusyIds((prev) => { const s = new Set(prev); s.delete(requestId); return s; });
    }
  }, [removeRequest, showToast]);

  const handleAcceptAll = useCallback(async (sec) => {
    const ids = sec.data.map((r) => r.id);
    setBusyIds((prev) => new Set([...prev, ...ids]));
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/unlock-requests/accept-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ target_type: sec.target_type, target_id: sec.target_id }),
      });
      const data = await res.json();
      if (res.ok) {
        const failedIds = new Set((data.failed || []).map((f) => f.request_id));
        setSections((prev) => prev
          .map((s) => (s.key !== sec.key ? s : { ...s, data: s.data.filter((r) => failedIds.has(r.id)) }))
          .filter((s) => s.data.length > 0));
        if (data.accepted_count > 0) {
          showToast({ type: 'success', message: `Accepted ${data.accepted_count} — chats started.` });
        }
        if (data.failed?.length) {
          showToast({ type: 'warning', message: `${data.failed.length} couldn't be accepted right now.` });
        }
      } else {
        showToast({ type: 'error', message: 'Could not accept all right now.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong.' });
    } finally {
      setBusyIds((prev) => { const s = new Set(prev); ids.forEach((id) => s.delete(id)); return s; });
    }
  }, [showToast]);

  const renderSectionHeader = useCallback(({ section }) => (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle} numberOfLines={2}>&ldquo;{section.title}&rdquo;</Text>
      <TouchableOpacity
        style={s.acceptAllBtn}
        onPress={() => handleAcceptAll(section)}
        activeOpacity={0.85}
        hitSlop={HIT_SLOP}
      >
        <Text style={s.acceptAllText}>Accept All ({section.data.length})</Text>
      </TouchableOpacity>
    </View>
  ), [handleAcceptAll]);

  const renderItem = useCallback(({ item }) => {
    const isBusy = busyIds.has(item.id);
    return (
      <View style={s.row}>
        <View style={s.rowInfo}>
          <RequestMediaThumb mediaUrl={item.media_url} mediaType={item.media_type} />
          <Text style={s.rowName}>{item.requester_anonymous_name}</Text>
        </View>
        {isBusy ? (
          <ActivityIndicator color={T.primary} size="small" />
        ) : (
          <View style={s.rowActions}>
            <TouchableOpacity style={s.declineBtn} onPress={() => handleDecline(item.id)} hitSlop={HIT_SLOP}>
              <Text style={s.declineBtnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.acceptBtn} onPress={() => handleAccept(item.id)} hitSlop={HIT_SLOP}>
              <Text style={s.acceptBtnText}>Accept</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }, [busyIds, handleAccept, handleDecline]);

  return (
    <SafeAreaView style={s.root}>
      <DropScreenHeader title="Requests" navigation={navigation} />

      {loading ? (
        <View style={s.centered}><ActivityIndicator color={T.primary} /></View>
      ) : sections.length === 0 ? (
        <View style={s.centered}>
          <Text style={s.emptyText}>No one's waiting to unlock a confession right now.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={s.listContent}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} colors={[T.primary]} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },
  emptyText: { color: T.textSecondary, fontSize: FONT.sm, textAlign: 'center' },
  listContent: { padding: SPACING.md },
  sectionHeader: {
    marginTop: SPACING.md, marginBottom: SPACING.sm,
    paddingHorizontal: rp(14), paddingVertical: rp(12),
    backgroundColor: T.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: T.border,
  },
  sectionTitle: {
    fontSize: FONT.sm, color: T.textSecondary, fontStyle: 'italic',
    lineHeight: FONT.sm * 1.5, marginBottom: rp(10),
  },
  acceptAllBtn: {
    alignSelf: 'flex-start', paddingHorizontal: rp(14), paddingVertical: rp(8),
    borderRadius: RADIUS.md, backgroundColor: T.primary,
  },
  acceptAllText: { color: '#fff', fontSize: FONT.xs, fontWeight: '700' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: rp(14), paddingVertical: rp(12),
    backgroundColor: T.surfaceAlt, borderRadius: RADIUS.md,
    marginBottom: rp(8),
  },
  rowInfo: { flexDirection: 'row', alignItems: 'center', gap: rp(10), flexShrink: 1 },
  rowName: { fontSize: FONT.sm, fontWeight: '600', color: T.text },
  thumbWrap: {
    width: rs(40), height: rs(40), borderRadius: RADIUS.sm, overflow: 'hidden',
    backgroundColor: T.border,
  },
  thumb: { width: '100%', height: '100%' },
  rowActions: { flexDirection: 'row', gap: rp(8) },
  declineBtn: {
    paddingHorizontal: rp(12), paddingVertical: rp(7), borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: T.border,
  },
  declineBtnText: { color: T.textSecondary, fontSize: FONT.xs, fontWeight: '600' },
  acceptBtn: {
    paddingHorizontal: rp(12), paddingVertical: rp(7), borderRadius: RADIUS.sm,
    backgroundColor: T.primary,
  },
  acceptBtnText: { color: '#fff', fontSize: FONT.xs, fontWeight: '700' },
});
