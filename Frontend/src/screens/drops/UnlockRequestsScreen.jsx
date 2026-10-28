/** Knocks: Received (grouped by confession, Let All In per group; coins move only on accept)
 * and Sent (your own knocks and what happened to them). Optional { targetType, targetId }
 * narrows Received to one confession; { inTab } when shown as the Requests tab. */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image,
  SectionList, FlatList, RefreshControl, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VideoView, useVideoPlayer } from 'expo-video';
import { X } from 'lucide-react-native';

import { T } from '../../utils/colorTokens';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import DropScreenHeader from '../../components/drops/DropScreenHeader';
import { useToast } from '../../components/ui/Toast';
import { useSocket } from '../../context/SocketContext';
import { useUnread } from '../../context/UnreadContext';
import { API_BASE_URL } from '../../config/api';
import { intentLabel } from '../../config/linkup';
import KnockClues from '../../components/rooms/KnockClues';

// Full-size clue viewer, mounted only while open so its video player is freed on close.
function MediaPreviewModal({ media, onClose }) {
  const isVideo = media.type === 'video';
  const player = useVideoPlayer(
    isVideo ? { uri: media.url } : null,
    (p) => { p.loop = true; p.play(); },
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={s.previewBackdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={s.previewMediaWrap} pointerEvents="box-none">
          {isVideo ? (
            <VideoView player={player} style={s.previewMedia} contentFit="contain" nativeControls />
          ) : (
            <Image source={{ uri: media.url }} style={s.previewMedia} resizeMode="contain" />
          )}
        </View>
        <TouchableOpacity style={s.previewCloseBtn} onPress={onClose} hitSlop={HIT_SLOP}>
          <X size={rs(20)} color="#fff" />
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

export default function UnlockRequestsScreen({ route, navigation }) {
  const { targetType, targetId, inTab } = route.params ?? {};
  const { showToast } = useToast();
  const { socketService } = useSocket();
  const { refreshUnread } = useUnread() || {};

  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyIds, setBusyIds] = useState(new Set());
  const [previewMedia, setPreviewMedia] = useState(null);
  const [view, setView] = useState('in');   // 'in' = received, 'sent' = your knocks
  const [sent, setSent] = useState([]);

  const load = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const qs = targetType && targetId
        ? `?target_type=${encodeURIComponent(targetType)}&target_id=${encodeURIComponent(targetId)}`
        : '';
      const headers = { Authorization: `Bearer ${token}` };
      const [res, sentRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/unlock-requests/incoming${qs}`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/unlock-requests/sent`, { headers }).catch(() => null),
      ]);
      const data = await res.json();
      if (sentRes?.ok) setSent((await sentRes.json())?.requests || []);
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
      showToast({ type: 'error', message: 'Could not load knocks.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [targetType, targetId, showToast]);

  useEffect(() => { load(); }, [load]);
  // Keep the tab badge in step as knocks are let in or declined.
  useEffect(() => { refreshUnread?.(); }, [sections, refreshUnread]);
  // As a tab it stays mounted, so refresh each time it's opened.
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  // Live updates — a fresh request or a withdrawn one just triggers a refetch
  // rather than hand-patching local groups, which keeps grouping correct.
  useEffect(() => {
    if (!socketService) return;
    const handleChange = () => load();
    const events = ['unlock_request_received', 'unlock_request_cancelled', 'unlock_request_accepted', 'unlock_request_declined'];
    events.forEach((e) => socketService.on?.(e, handleChange));
    return () => events.forEach((e) => socketService.off?.(e, handleChange));
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
        showToast({ type: 'success', message: "Let in. They're inside your Room." });
        removeRequest(requestId);
      } else {
        showToast({ type: 'warning', message: data.detail || 'Could not let them in right now.' });
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
          showToast({ type: 'success', message: `Let in ${data.accepted_count}. They're inside.` });
        }
        if (data.failed?.length) {
          showToast({ type: 'warning', message: `${data.failed.length} couldn't be let in right now.` });
        }
      } else {
        showToast({ type: 'error', message: 'Could not let everyone in right now.' });
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
        <Text style={s.acceptAllText}>Let All In ({section.data.length})</Text>
      </TouchableOpacity>
    </View>
  ), [handleAcceptAll]);

  const renderItem = useCallback(({ item }) => {
    const isBusy = busyIds.has(item.id);
    const thumbs = (item.requester_gallery || []).filter((g) => g.media_url && g.media_type !== 'video').slice(0, 3);
    return (
      <View style={s.row}>
        <TouchableOpacity
          style={s.rowMain}
          activeOpacity={0.8}
          onPress={() => item.requester_id && navigation.navigate('Room', { userId: item.requester_id })}
        >
          <View style={s.rowInfo}>
            {/* Knocker's photo, else their initial. */}
            {item.requester_avatar_url ? (
              <Image source={{ uri: item.requester_avatar_url }} style={s.rowAvatar} />
            ) : (
              <View style={s.rowAvatar}>
                <Text style={s.rowAvatarText}>
                  {item.requester_anonymous_name?.[0]?.toUpperCase() || 'A'}
                </Text>
              </View>
            )}
            <Text style={s.rowName}>{item.requester_anonymous_name}</Text>
          </View>
          <Text style={[s.rowPitch, !item.pitch && s.rowPitchEmpty]} numberOfLines={2}>
            {item.pitch || 'knocked on your door'}
          </Text>
          {!!item.intents?.length && (
            <View style={s.rowChips}>
              {item.intents.map((i) => <Text key={i} style={s.rowChip}>{intentLabel(i)}</Text>)}
            </View>
          )}
          <KnockClues item={item} onOpenMedia={setPreviewMedia} />
          {thumbs.length > 0 && (
            <View style={s.rowThumbs}>
              {thumbs.map((g, k) => <Image key={k} source={{ uri: g.media_url }} style={s.rowThumb} />)}
            </View>
          )}
        </TouchableOpacity>
        {isBusy ? (
          <ActivityIndicator color={T.primary} size="small" />
        ) : (
          <View style={s.rowActions}>
            <TouchableOpacity style={s.declineBtn} onPress={() => handleDecline(item.id)} hitSlop={HIT_SLOP}>
              <Text style={s.declineBtnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.acceptBtn} onPress={() => handleAccept(item.id)} hitSlop={HIT_SLOP}>
              <Text style={s.acceptBtnText}>Let In</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }, [busyIds, handleAccept, handleDecline, navigation]);

  const handleCancel = useCallback(async (requestId) => {
    setBusyIds((prev) => new Set(prev).add(requestId));
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/unlock-requests/${requestId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) load();
      else showToast({ type: 'error', message: 'Could not take it back right now.' });
    } catch {
      showToast({ type: 'error', message: 'Something went wrong.' });
    } finally {
      setBusyIds((prev) => { const s = new Set(prev); s.delete(requestId); return s; });
    }
  }, [load, showToast]);

  const renderSent = useCallback(({ item }) => {
    const isBusy = busyIds.has(item.id);
    const [title, note] = {
      pending:  ['Waiting at their door…', "Nothing's charged yet. Coins move only if they let you in."],
      accepted: ["You're inside.", 'They let you in. Your chat is open.'],
      declined: ["They're not up for it right now", 'No coins were spent. You can knock again anytime.'],
      expired:  ['This knock expired', 'They never answered. No coins were spent.'],
    }[item.status] || [item.status, ''];
    return (
      <View style={s.sentRow}>
        {!!item.confession_snippet && (
          <Text style={s.sectionTitle} numberOfLines={2}>&ldquo;{item.confession_snippet}&rdquo;</Text>
        )}
        <Text style={[s.rowName, item.status === 'accepted' && { color: T.primary }]}>{title}</Text>
        {!!note && <Text style={s.sentNote}>{note}</Text>}
        {isBusy ? (
          <ActivityIndicator color={T.primary} size="small" style={{ alignSelf: 'flex-start' }} />
        ) : (
          <View style={s.rowActions}>
            {item.status === 'accepted' && !!item.connection_id && (
              <TouchableOpacity style={s.acceptBtn} onPress={() => navigation.navigate('DropChat', { connectionId: item.connection_id })} hitSlop={HIT_SLOP}>
                <Text style={s.acceptBtnText}>Open chat</Text>
              </TouchableOpacity>
            )}
            {item.status === 'pending' && (
              <TouchableOpacity style={s.declineBtn} onPress={() => handleCancel(item.id)} hitSlop={HIT_SLOP}>
                <Text style={s.declineBtnText}>Take back knock</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  }, [busyIds, handleCancel, navigation]);

  const pendingSent = sent.filter((r) => r.status === 'pending').length;
  const received = sections.reduce((n, sec) => n + sec.data.length, 0);
  const refresh = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} colors={[T.primary]} />;

  return (
    <SafeAreaView style={s.root} edges={inTab ? ['top'] : undefined}>
      <DropScreenHeader title="Knocks" navigation={navigation} hideBack={inTab} />

      {!targetId && (
        <View style={s.segs}>
          {[['in', `Received${received ? ` · ${received}` : ''}`], ['sent', `Sent${pendingSent ? ` · ${pendingSent}` : ''}`]].map(([key, label]) => (
            <TouchableOpacity key={key} style={[s.seg, view === key && s.segOn]} onPress={() => setView(key)} activeOpacity={0.85}>
              <Text style={[s.segText, view === key && s.segTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <View style={s.centered}><ActivityIndicator color={T.primary} /></View>
      ) : view === 'sent' ? (
        sent.length === 0 ? (
          <View style={s.centered}>
            <Text style={s.emptyText}>You haven't knocked on anyone yet. Find a confession you can't stop thinking about.</Text>
          </View>
        ) : (
          <FlatList
            data={sent}
            keyExtractor={(item) => item.id}
            renderItem={renderSent}
            contentContainerStyle={s.listContent}
            refreshControl={refresh}
          />
        )
      ) : sections.length === 0 ? (
        <View style={s.centered}>
          <Text style={s.emptyText}>No knocks yet. Post something for tonight and watch your door.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={s.listContent}
          stickySectionHeadersEnabled={false}
          refreshControl={refresh}
        />
      )}

      {previewMedia && (
        <MediaPreviewModal media={previewMedia} onClose={() => setPreviewMedia(null)} />
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: rp(10),
    paddingHorizontal: rp(14), paddingVertical: rp(12),
    backgroundColor: T.surfaceAlt, borderRadius: RADIUS.md,
    marginBottom: rp(8),
  },
  rowMain: { flex: 1, minWidth: 0, gap: rp(6) },
  rowInfo: { flexDirection: 'row', alignItems: 'center', gap: rp(10), flexShrink: 1 },
  rowPitch: { fontSize: FONT.sm, color: T.text, lineHeight: FONT.sm * 1.4 },
  rowPitchEmpty: { color: T.textSecondary, fontStyle: 'italic' },
  rowChips: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(5) },
  rowChip: { fontSize: rf(10.5), color: T.text, borderWidth: 1, borderColor: T.borderStrong, paddingHorizontal: rp(8), paddingVertical: rp(2), borderRadius: 999 },
  rowThumbs: { flexDirection: 'row', gap: rp(4) },
  rowThumb: { width: rs(30), height: rs(40), borderRadius: rs(6), backgroundColor: T.border },
  rowAvatar: {
    width: rs(30), height: rs(30), borderRadius: rs(15),
    backgroundColor: T.avatarBg, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,99,74,0.2)',
  },
  rowAvatarText: { fontSize: FONT.xs, fontWeight: '700', color: T.primary },
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
  segs: { flexDirection: 'row', gap: rp(8), paddingHorizontal: SPACING.md, paddingTop: rp(4) },
  seg: { paddingHorizontal: rp(14), paddingVertical: rp(7), borderRadius: 999, borderWidth: 1, borderColor: T.border },
  segOn: { backgroundColor: T.primary, borderColor: T.primary },
  segText: { color: T.textSecondary, fontSize: FONT.xs, fontWeight: '600' },
  segTextOn: { color: '#fff' },
  sentRow: {
    gap: rp(6), paddingHorizontal: rp(14), paddingVertical: rp(12),
    backgroundColor: T.surfaceAlt, borderRadius: RADIUS.md, marginBottom: rp(8),
  },
  sentNote: { color: T.textSecondary, fontSize: FONT.xs, lineHeight: FONT.xs * 1.4 },

  previewBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center', justifyContent: 'center',
  },
  previewMediaWrap: { width: '100%', height: '70%' },
  previewMedia: { width: '100%', height: '100%' },
  previewCloseBtn: {
    position: 'absolute', top: rp(16), right: rp(16),
    width: rs(38), height: rs(38), borderRadius: rs(19),
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
});
