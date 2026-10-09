import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft } from 'lucide-react-native';

import { rs, rp, rf, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

// Authenticated fetch against /api/v1. Resolves to { ok, status, data }.
export async function apiFetch(path, { method = 'GET', body } = {}) {
  const token = await AsyncStorage.getItem('token');
  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { ok: res.ok, status: res.status, data };
}

export const AdminHeader = ({ title, onBack, right }) => (
  <View style={a.header}>
    <TouchableOpacity onPress={onBack} hitSlop={HIT_SLOP} style={a.headerBtn}>
      <ArrowLeft size={rs(20)} color={T.text} />
    </TouchableOpacity>
    <Text style={a.headerTitle} numberOfLines={1}>{title}</Text>
    <View style={a.headerBtn}>{right}</View>
  </View>
);

export const a = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: rp(12),
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  headerBtn: { padding: rp(4), width: rs(28) },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FONT.md, fontWeight: '700', color: T.text, fontFamily: 'PlayfairDisplay-Bold' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: rp(8),
    marginHorizontal: SPACING.md, marginTop: SPACING.sm,
    backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: rp(12), height: rs(40),
  },
  searchInput: { flex: 1, color: T.text, fontSize: FONT.sm },
  listContent: { padding: SPACING.md, gap: rp(8), paddingBottom: rs(40) },
  emptyText: { color: T.textMuted, fontSize: FONT.sm, textAlign: 'center', marginTop: rs(40) },
  card: {
    backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border,
    padding: rp(12), gap: rp(6),
  },
  cardTitle: { fontSize: FONT.sm, fontWeight: '700', color: T.text },
  cardBody: { fontSize: FONT.sm, color: T.textSecondary, lineHeight: rf(18) },
  cardMeta: { fontSize: rf(10), color: T.textMuted },
  actionRow: { flexDirection: 'row', gap: rp(8), marginTop: rp(4) },
  btn: {
    flex: 1, height: rs(36), borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border,
  },
  btnPrimary: { backgroundColor: T.primary, borderColor: T.primary },
  btnDanger: { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.4)' },
  btnText: { fontSize: FONT.xs, fontWeight: '700', color: T.text },
  badge: {
    alignSelf: 'flex-start', borderRadius: RADIUS.full, paddingHorizontal: rp(8), paddingVertical: rp(2),
    backgroundColor: T.surfaceAlt,
  },
  badgeText: { fontSize: rf(10), fontWeight: '700', color: T.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
});
