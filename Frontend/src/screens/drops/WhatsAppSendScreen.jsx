/**
 * WhatsAppSendScreen — send a confession to one person's WhatsApp, anonymously.
 * Anonixx messages them from its own number and asks first; the confession is
 * only shown if they accept. The sender is never named.
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ShieldCheck } from 'lucide-react-native';

import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import T from '../../utils/theme';
import { apiFetch } from '../admin/adminShared';

const MAX_LEN = 500;

const STATUS_LABEL = {
  pending:   'Waiting for them',
  delivered: 'Delivered',
  declined:  'Declined',
  expired:   'Expired',
  failed:    'Not delivered',
};

export default function WhatsAppSendScreen({ navigation, route }) {
  const { showToast } = useToast();
  const [text, setText]       = useState(route.params?.text ?? '');
  const [phone, setPhone]     = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);

  const loadHistory = useCallback(async () => {
    try {
      const { ok, data } = await apiFetch('/whatsapp/sent');
      if (ok) setHistory(data.messages || []);
    } catch { /* history is a nicety */ }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const send = useCallback(async () => {
    if (sending) return;
    if (!text.trim()) {
      showToast({ type: 'warning', message: 'Write your confession first.' });
      return;
    }
    if (phone.replace(/\D/g, '').length < 8) {
      showToast({ type: 'warning', message: "Enter their WhatsApp number." });
      return;
    }
    setSending(true);
    try {
      const { ok, data } = await apiFetch('/whatsapp/send', {
        method: 'POST', body: { phone: phone.trim(), text: text.trim() },
      });
      if (ok) {
        showToast({
          type: 'success',
          title: 'Sent.',
          message: "They'll be asked before anything is shown. You stay anonymous.",
        });
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      } else {
        const detail = typeof data?.detail === 'string' ? data.detail : null;
        showToast({ type: 'error', message: detail || 'Could not send. Try again.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not send. Try again.' });
    } finally {
      setSending(false);
    }
  }, [sending, text, phone, navigation, showToast]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP}>
            <ChevronLeft size={rs(24)} color={T.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Send to someone</Text>
          <View style={{ width: rs(24) }} />
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.note}>
            <ShieldCheck size={rs(16)} color={T.primary} />
            <Text style={s.noteText}>
              We message them on WhatsApp from Anonixx's number. They choose to accept or decline
              before seeing it, and they get a link to the same post on Anonixx. Your name and number are never shared. Posting costs 3 coins (free on premium).
            </Text>
          </View>

          <Text style={s.label}>Their WhatsApp number</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="+254 712 345 678"
            placeholderTextColor={T.textMuted}
            keyboardType="phone-pad"
            style={s.input}
            maxLength={20}
          />

          <Text style={s.label}>Your confession</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Say what you've been holding back…"
            placeholderTextColor={T.textMuted}
            style={[s.input, s.textArea]}
            multiline
            maxLength={MAX_LEN}
          />
          <Text style={s.counter}>{text.length}/{MAX_LEN}</Text>

          <TouchableOpacity style={[s.sendBtn, sending && { opacity: 0.6 }]} onPress={send} disabled={sending} activeOpacity={0.88}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={s.sendText}>Send anonymously</Text>}
          </TouchableOpacity>

          {history.length > 0 && (
            <View style={{ marginTop: SPACING.lg, gap: rp(8) }}>
              <Text style={s.label}>Sent</Text>
              {history.map((m) => (
                <View key={m.id} style={s.historyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.historyTo}>{m.to}</Text>
                    <Text style={s.historyText} numberOfLines={1}>{m.text}</Text>
                  </View>
                  <Text style={[s.historyStatus, m.status === 'delivered' && { color: '#22c55e' }]}>
                    {STATUS_LABEL[m.status] || m.status}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  headerTitle: { color: T.text, fontSize: FONT.md, fontWeight: '700' },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },
  note: {
    flexDirection: 'row', gap: rp(8), alignItems: 'flex-start',
    backgroundColor: T.primaryTint, borderRadius: RADIUS.md, padding: rp(12), marginBottom: SPACING.md,
    borderWidth: 1, borderColor: T.primaryBorder,
  },
  noteText: { flex: 1, color: T.textSecondary, fontSize: rf(12), lineHeight: rf(17) },
  label: { color: T.textSecondary, fontSize: rf(12), fontWeight: '600', marginTop: SPACING.sm, marginBottom: rp(6) },
  input: {
    backgroundColor: T.inputBg, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: rp(14), paddingVertical: rp(12), color: T.text, fontSize: FONT.sm,
  },
  textArea: { minHeight: rs(140), textAlignVertical: 'top' },
  counter: { color: T.textMuted, fontSize: rf(11), alignSelf: 'flex-end', marginTop: rp(4) },
  sendBtn: {
    height: rs(48), borderRadius: RADIUS.lg, backgroundColor: T.primary,
    alignItems: 'center', justifyContent: 'center', marginTop: SPACING.md,
  },
  sendText: { color: '#fff', fontSize: FONT.sm, fontWeight: '700' },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: rp(10), backgroundColor: T.surface,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border, padding: rp(12),
  },
  historyTo: { color: T.text, fontSize: rf(12), fontWeight: '600' },
  historyText: { color: T.textMuted, fontSize: rf(12), marginTop: rp(2) },
  historyStatus: { color: T.textSecondary, fontSize: rf(11), fontWeight: '600' },
});
