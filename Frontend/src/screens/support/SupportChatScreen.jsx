/**
 * SupportChatScreen — one screen for both sides of customer support.
 * With route.params.userId it's the admin view of that user's thread;
 * without, it's the signed-in user's own thread with Anonixx support
 * (plus a way to request a coin-purchase refund).
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Send, RotateCcw, X } from 'lucide-react-native';

import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import T from '../../utils/theme';
import { apiFetch, AdminHeader, a } from '../admin/adminShared';

const POLL_MS = 5000;

const Bubble = React.memo(({ item, mine }) => (
  <View style={[s.bubbleRow, mine ? s.rowMine : s.rowTheirs]}>
    <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleTheirs]}>
      <Text style={[s.bubbleText, mine && { color: '#fff' }]}>{item.text}</Text>
      <Text style={[s.bubbleTime, mine && { color: 'rgba(255,255,255,0.7)' }]}>
        {item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
      </Text>
    </View>
  </View>
));

export default function SupportChatScreen({ navigation, route }) {
  const targetUserId = route.params?.userId;
  const isAdminView = !!targetUserId;
  const base = isAdminView ? `/admin/support/conversations/${targetUserId}/messages` : '/support/messages';

  const { showToast } = useToast();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [purchases, setPurchases]   = useState([]);
  const [pickedId, setPickedId]     = useState(null);
  const [reason, setReason]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const listRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { ok, data } = await apiFetch(base);
      if (ok) setMessages(data.messages || []);
    } catch { /* keep what we have; next poll retries */ }
    finally { setLoading(false); }
  }, [base]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (messages.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages.length]);

  const send = useCallback(async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const { ok, data } = await apiFetch(base, { method: 'POST', body: { text: body } });
      if (ok) { setMessages((prev) => [...prev, data]); setText(''); }
      else showToast({ type: 'error', message: data?.detail || 'Could not send.' });
    } catch {
      showToast({ type: 'error', message: 'Could not send. Try again.' });
    } finally {
      setSending(false);
    }
  }, [text, sending, base, showToast]);

  const openRefund = useCallback(async () => {
    setRefundOpen(true);
    setPickedId(null);
    setReason('');
    const { ok, data } = await apiFetch('/support/refundable-purchases');
    setPurchases(ok ? data.purchases || [] : []);
  }, []);

  const submitRefund = useCallback(async () => {
    if (!pickedId || !reason.trim()) {
      showToast({ type: 'warning', message: 'Pick a purchase and say why.' });
      return;
    }
    setSubmitting(true);
    try {
      const { ok, data } = await apiFetch('/support/refund-requests', {
        method: 'POST', body: { purchase_id: pickedId, reason: reason.trim() },
      });
      if (ok) {
        setRefundOpen(false);
        showToast({ type: 'success', message: 'Refund request sent.' });
        load();
      } else {
        showToast({ type: 'error', message: data?.detail || 'Could not send request.' });
      }
    } finally {
      setSubmitting(false);
    }
  }, [pickedId, reason, showToast, load]);

  const mineSender = isAdminView ? 'admin' : 'user';

  return (
    <SafeAreaView style={a.safe} edges={['top', 'left', 'right']}>
      <AdminHeader
        title={isAdminView ? (route.params?.name || 'User') : 'Customer support'}
        onBack={() => navigation.goBack()}
        right={!isAdminView ? (
          <TouchableOpacity onPress={openRefund} hitSlop={HIT_SLOP}>
            <RotateCcw size={rs(18)} color={T.primary} />
          </TouchableOpacity>
        ) : null}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading ? (
          <View style={a.centered}><ActivityIndicator color={T.primary} size="large" /></View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <Bubble item={item} mine={item.sender === mineSender} />}
            contentContainerStyle={s.list}
            ListEmptyComponent={
              <Text style={a.emptyText}>
                {isAdminView ? 'No messages.' : 'Ask us anything — a real person from Anonixx replies here.\nTap the arrow icon to request a coin refund.'}
              </Text>
            }
          />
        )}

        <View style={s.inputBar}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor={T.textMuted}
            style={s.input}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity style={s.sendBtn} onPress={send} disabled={sending || !text.trim()} activeOpacity={0.85}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Send size={rs(16)} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={refundOpen} transparent animationType="fade" onRequestClose={() => setRefundOpen(false)}>
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Request a refund</Text>
              <TouchableOpacity onPress={() => setRefundOpen(false)} hitSlop={HIT_SLOP}>
                <X size={rs(18)} color={T.textMuted} />
              </TouchableOpacity>
            </View>
            {purchases.length === 0 ? (
              <Text style={a.cardMeta}>No refundable coin purchases found.</Text>
            ) : (
              purchases.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[s.purchase, pickedId === p.id && s.purchasePicked]}
                  onPress={() => setPickedId(p.id)}
                  activeOpacity={0.85}
                >
                  <Text style={a.cardTitle}>{p.coins} coins{p.kes ? ` · KES ${p.kes}` : ''}</Text>
                  <Text style={a.cardMeta}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}</Text>
                </TouchableOpacity>
              ))
            )}
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="What went wrong?"
              placeholderTextColor={T.textMuted}
              style={s.reasonInput}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[a.btn, a.btnPrimary, { flex: 0, height: rs(44) }]}
              onPress={submitRefund}
              disabled={submitting || purchases.length === 0}
              activeOpacity={0.88}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[a.btnText, { color: '#fff' }]}>Send request</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  list: { padding: SPACING.md, gap: rp(8), flexGrow: 1 },
  bubbleRow: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: RADIUS.md, paddingHorizontal: rp(12), paddingVertical: rp(8), gap: rp(2) },
  bubbleMine: { backgroundColor: T.primary },
  bubbleTheirs: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  bubbleText: { color: T.text, fontSize: FONT.sm, lineHeight: rf(18) },
  bubbleTime: { color: T.textMuted, fontSize: rf(9), alignSelf: 'flex-end' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: rp(8),
    padding: SPACING.sm, borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.background,
  },
  input: {
    flex: 1, maxHeight: rs(100), backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1,
    borderColor: T.border, paddingHorizontal: rp(12), paddingVertical: rp(8), color: T.text, fontSize: FONT.sm,
  },
  sendBtn: { width: rs(40), height: rs(40), borderRadius: rs(20), backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: SPACING.lg },
  modal: { backgroundColor: T.background, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: T.border, padding: SPACING.md, gap: rp(10) },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: FONT.md, fontWeight: '700', color: T.text },
  purchase: { backgroundColor: T.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: T.border, padding: rp(10), gap: rp(2) },
  purchasePicked: { borderColor: T.primary },
  reasonInput: {
    minHeight: rs(60), backgroundColor: T.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: rp(12), paddingVertical: rp(10), color: T.text, fontSize: FONT.sm, textAlignVertical: 'top',
  },
});
