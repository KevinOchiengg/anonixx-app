import AsyncStorage from '@react-native-async-storage/async-storage';
import { Flag, UserX, X } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { API_BASE_URL } from '../../config/api';
import { FONT, HIT_SLOP, RADIUS, rp, rs } from '../../utils/responsive';
import T from '../../utils/theme';
import { useToast } from '../ui/Toast';

const REASONS = [
  ['abuse', 'Harassment or abuse'],
  ['explicit', 'Sexually explicit or unwanted'],
  ['doxxing', 'Shares private info'],
  ['self-harm-concern', 'Self-harm concern'],
  ['spam', 'Spam or scam'],
  ['other', 'Something else'],
];

export default function ReportSheet({ visible, post, onClose, onBlocked }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const auth = useCallback(async () => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      showToast({ type: 'info', message: 'Sign in to report or block.' });
      return null;
    }
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }, [showToast]);

  const report = useCallback(async (reason) => {
    if (!post || busy) return;
    const headers = await auth();
    if (!headers) { onClose(); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/drops/${post.id}/report`, {
        method: 'POST', headers, body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error();
      showToast({ type: 'success', message: 'Report received. Thank you.' });
    } catch {
      showToast({ type: 'error', message: 'Could not send the report. Try again.' });
    } finally {
      setBusy(false);
      onClose();
    }
  }, [post, busy, auth, onClose, showToast]);

  const block = useCallback(() => {
    if (!post?.user_id) return;
    Alert.alert('Block this person?', "You won't see each other's posts or messages.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block', style: 'destructive',
        onPress: async () => {
          const headers = await auth();
          if (!headers) { onClose(); return; }
          try {
            const res = await fetch(`${API_BASE_URL}/api/v1/users/${post.user_id}/block`, { method: 'POST', headers });
            if (!res.ok) throw new Error();
            showToast({ type: 'success', message: 'Blocked.' });
            onBlocked?.(post);
          } catch {
            showToast({ type: 'error', message: 'Could not block. Try again.' });
          }
          onClose();
        },
      },
    ]);
  }, [post, auth, onClose, onBlocked, showToast]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <View style={s.sheet} onStartShouldSetResponder={() => true}>
          <View style={s.head}>
            <Flag size={rs(16)} color={T.primary} />
            <Text style={s.title}>Report this post</Text>
            <TouchableOpacity onPress={onClose} hitSlop={HIT_SLOP}><X size={rs(20)} color={T.textSecondary} /></TouchableOpacity>
          </View>
          {busy ? <ActivityIndicator color={T.primary} style={{ margin: rp(20) }} /> : REASONS.map(([k, label]) => (
            <TouchableOpacity key={k} style={s.row} onPress={() => report(k)}>
              <Text style={s.rowText}>{label}</Text>
            </TouchableOpacity>
          ))}
          {post?.user_id && !busy ? (
            <TouchableOpacity style={s.row} onPress={block}>
              <UserX size={rs(18)} color={T.primary} />
              <Text style={[s.rowText, { color: T.primary }]}>Block this person</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: T.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, paddingBottom: rp(24) },
  head: { flexDirection: 'row', alignItems: 'center', gap: rp(10), padding: rp(16), borderBottomWidth: 1, borderBottomColor: T.border },
  title: { flex: 1, fontSize: FONT.md, fontWeight: '700', color: T.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: rp(12), padding: rp(16), borderBottomWidth: 1, borderBottomColor: T.border },
  rowText: { fontSize: FONT.md, color: T.text },
});
