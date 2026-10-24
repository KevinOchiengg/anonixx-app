/**
 * AdminUsersScreen.jsx
 *
 * Search + moderate users: ban/unban, verify, grant/revoke admin, and a
 * manual coin credit/debit. All backed by existing app/api/v1/admin.py
 * endpoints — this screen is just the first UI ever built for them.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Search, ShieldCheck, ShieldOff, BadgeCheck, Coins, Trash2, X, ChevronDown, ChevronUp,
} from 'lucide-react-native';

import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP, BUTTON_HEIGHT } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

// One labelled action in the expanded panel.
const ActionBtn = ({ icon: Icon, label, onPress, danger, on }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[s.actBtn, danger && s.actBtnDanger]}>
    <Icon size={rs(14)} color={danger ? '#EF4444' : on ? T.primary : T.textSecondary} />
    <Text style={[s.actText, danger && s.actTextDanger]}>{label}</Text>
  </TouchableOpacity>
);

// Collapsed: name, facts and a Manage toggle. Open: the actions in labelled
// groups under the row (same layout as the web admin Users page).
const UserRow = React.memo(({ item, isSuper, open, onToggle, onBan, onVerify, onAdmin, onAdjustCoins, onDelete }) => (
  <View style={[s.userCard, open && s.userCardOpen]}>
    <TouchableOpacity style={s.userTop} onPress={() => onToggle(item.id)} activeOpacity={0.8} accessibilityState={{ expanded: open }}>
      <View style={{ flex: 1 }}>
        <Text style={s.userName}>{item.anonymous_name || item.username || item.email}</Text>
        <Text style={s.userMeta}>
          {item.email} · {item.coin_balance} coins
          {item.is_super_admin ? ' · super admin' : item.is_admin ? ' · admin' : ''}
          {item.is_verified ? ' · verified' : ''}
          {!item.is_active ? ' · BANNED' : ''}
        </Text>
      </View>
      <View style={s.manage}>
        <Text style={s.manageText}>Manage</Text>
        {open ? <ChevronUp size={rs(14)} color={T.textSecondary} /> : <ChevronDown size={rs(14)} color={T.textSecondary} />}
      </View>
    </TouchableOpacity>

    {open && (
      <View style={s.groups}>
        <View style={s.group}>
          <Text style={s.groupLabel}>MODERATION</Text>
          <View style={s.groupRow}>
            <ActionBtn icon={ShieldOff} label={item.is_active ? 'Ban' : 'Unban'} onPress={() => onBan(item)} on={!item.is_active} />
            <ActionBtn icon={BadgeCheck} label={item.is_verified ? 'Unverify' : 'Verify'} onPress={() => onVerify(item)} on={item.is_verified} />
          </View>
        </View>
        {isSuper && (
          <>
            <View style={s.group}>
              <Text style={s.groupLabel}>ACCOUNT</Text>
              <View style={s.groupRow}>
                <ActionBtn icon={Coins} label="Coins" onPress={() => onAdjustCoins(item)} />
                <ActionBtn icon={ShieldCheck} label={item.is_admin ? 'Remove admin' : 'Make admin'} onPress={() => onAdmin(item)} on={item.is_admin} />
              </View>
            </View>
            <View style={s.group}>
              <Text style={s.groupLabel}>DANGER</Text>
              <View style={s.groupRow}>
                <ActionBtn icon={Trash2} label="Delete" onPress={() => onDelete(item)} danger />
              </View>
            </View>
          </>
        )}
      </View>
    )}
  </View>
));

export default function AdminUsersScreen({ navigation, route }) {
  const isSuper = !!route.params?.isSuper;
  const { showToast } = useToast();
  const [users, setUsers]     = useState([]);
  const [query, setQuery]     = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId]   = useState(null); // the one user whose actions are expanded
  const toggleOpen = useCallback((id) => setOpenId((cur) => (cur === id ? null : id)), []);
  const [coinModalUser, setCoinModalUser] = useState(null);
  const [coinAmount, setCoinAmount]       = useState('');
  const [coinReason, setCoinReason]       = useState('');
  const [savingCoins, setSavingCoins]     = useState(false);
  const searchTimer = useRef(null);

  const authHeaders = useCallback(async () => {
    const token = await AsyncStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadUsers = useCallback(async (search = '') => {
    setLoading(true);
    try {
      const headers = await authHeaders();
      const params = new URLSearchParams({ limit: '50' });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`${API_BASE_URL}/api/v1/admin/users?${params}`, { headers });
      if (res.ok) setUsers((await res.json()).users || []);
    } catch {
      showToast({ type: 'error', message: 'Could not load users.' });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, showToast]);

  useEffect(() => { loadUsers(''); }, [loadUsers]);

  const handleSearchChange = useCallback((text) => {
    setQuery(text);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadUsers(text), 350);
  }, [loadUsers]);

  const patchUser = useCallback(async (userId, path) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/admin/users/${userId}/${path}`, {
        method: 'PATCH',
        headers: await authHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...data } : u)));
      } else {
        showToast({ type: 'error', message: data.detail || 'Action failed.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Action failed. Try again.' });
    }
  }, [authHeaders, showToast]);

  const handleBan = useCallback((user) => patchUser(user.id, 'ban'), [patchUser]);
  const handleVerify = useCallback((user) => patchUser(user.id, 'verify'), [patchUser]);
  const handleAdmin = useCallback((user) => patchUser(user.id, 'admin'), [patchUser]);

  const doDelete = useCallback(async (user) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
        showToast({ type: 'success', message: `Deleted. ${data.drops_deleted} posts removed.` });
      } else {
        showToast({ type: 'error', message: data.detail || 'Could not delete user.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not delete user. Try again.' });
    }
  }, [authHeaders, showToast]);

  const handleDelete = useCallback((user) => {
    Alert.alert(
      'Delete this user?',
      `${user.anonymous_name || user.email} and all their posts are removed permanently.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => doDelete(user) }],
    );
  }, [doDelete]);

  const handleSubmitCoins = useCallback(async () => {
    const amount = parseInt(coinAmount, 10);
    if (!amount || !coinReason.trim()) {
      showToast({ type: 'warning', message: 'Enter an amount and a reason.' });
      return;
    }
    setSavingCoins(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/admin/users/${coinModalUser.id}/coins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ amount, reason: coinReason.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.id === coinModalUser.id ? { ...u, coin_balance: data.new_balance } : u)));
        showToast({ type: 'success', message: `New balance: ${data.new_balance} coins.` });
        setCoinModalUser(null); setCoinAmount(''); setCoinReason('');
      } else {
        showToast({ type: 'error', message: data.detail || 'Could not adjust coins.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not adjust coins. Try again.' });
    } finally {
      setSavingCoins(false);
    }
  }, [coinAmount, coinReason, coinModalUser, authHeaders, showToast]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} style={s.headerBtn}>
          <ArrowLeft size={rs(20)} color={T.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Users</Text>
        <View style={s.headerBtn} />
      </View>

      <View style={s.searchRow}>
        <Search size={rs(15)} color={T.textMuted} />
        <TextInput
          value={query}
          onChangeText={handleSearchChange}
          placeholder="Search email, username, anon name…"
          placeholderTextColor={T.textMuted}
          style={s.searchInput}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator color={T.primary} size="large" /></View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          extraData={openId}
          renderItem={({ item }) => (
            <UserRow
              item={item}
              isSuper={isSuper}
              open={openId === item.id}
              onToggle={toggleOpen}
              onDelete={handleDelete}
              onBan={handleBan}
              onVerify={handleVerify}
              onAdmin={handleAdmin}
              onAdjustCoins={setCoinModalUser}
            />
          )}
          contentContainerStyle={s.listContent}
          ListEmptyComponent={<Text style={s.emptyText}>No users found.</Text>}
        />
      )}

      <Modal visible={!!coinModalUser} transparent animationType="fade" onRequestClose={() => setCoinModalUser(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Adjust coins</Text>
              <TouchableOpacity onPress={() => setCoinModalUser(null)} hitSlop={HIT_SLOP}>
                <X size={rs(18)} color={T.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalSub}>{coinModalUser?.anonymous_name || coinModalUser?.email}</Text>
            <TextInput
              value={coinAmount}
              onChangeText={(v) => setCoinAmount(v.replace(/[^0-9-]/g, ''))}
              placeholder="Amount — negative to debit"
              placeholderTextColor={T.textMuted}
              style={s.modalInput}
              keyboardType="numbers-and-punctuation"
            />
            <TextInput
              value={coinReason}
              onChangeText={setCoinReason}
              placeholder="Reason"
              placeholderTextColor={T.textMuted}
              style={s.modalInput}
            />
            <TouchableOpacity
              style={s.modalSubmit}
              onPress={handleSubmitCoins}
              disabled={savingCoins}
              activeOpacity={0.88}
            >
              {savingCoins ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.modalSubmitText}>Apply</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: rp(12),
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  headerBtn: { padding: rp(4), width: rs(28) },
  headerTitle: { fontSize: FONT.md, fontWeight: '700', color: T.text, fontFamily: 'PlayfairDisplay-Bold' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: rp(8),
    marginHorizontal: SPACING.md, marginTop: SPACING.sm,
    backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: rp(12), height: rs(40),
  },
  searchInput: { flex: 1, color: T.text, fontSize: FONT.sm },

  listContent: { padding: SPACING.md, gap: rp(8), paddingBottom: rs(40) },
  emptyText: { color: T.textMuted, fontSize: FONT.sm, textAlign: 'center', marginTop: rs(40) },

  userCard: {
    backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border, padding: rp(12),
  },
  userCardOpen: { borderColor: T.borderStrong },
  userTop: { flexDirection: 'row', alignItems: 'center', gap: rp(10) },
  userName: { fontSize: FONT.sm, fontWeight: '700', color: T.text },
  userMeta: { fontSize: rf(10), color: T.textMuted, marginTop: rp(2) },
  manage: {
    flexDirection: 'row', alignItems: 'center', gap: rp(4),
    paddingHorizontal: rp(10), paddingVertical: rp(6), borderRadius: RADIUS.full, borderWidth: 1, borderColor: T.borderStrong,
  },
  manageText: { fontSize: rf(12), fontWeight: '700', color: T.text },
  groups: { marginTop: rp(12), paddingTop: rp(12), borderTopWidth: 1, borderTopColor: T.border, gap: rp(12) },
  group: { gap: rp(6) },
  groupLabel: { fontSize: rf(10), fontWeight: '800', letterSpacing: 0.8, color: T.textMuted },
  groupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8) },
  actBtn: {
    flexDirection: 'row', alignItems: 'center', gap: rp(6),
    paddingHorizontal: rp(12), paddingVertical: rp(8), borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: T.borderStrong, backgroundColor: T.background,
  },
  actBtnDanger: { borderColor: 'rgba(239,68,68,0.45)', backgroundColor: 'rgba(239,68,68,0.10)' },
  actText: { fontSize: rf(12), fontWeight: '700', color: T.text },
  actTextDanger: { color: '#fca5a5' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: SPACING.lg },
  modalCard: { backgroundColor: T.background, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: T.border, padding: SPACING.md, gap: rp(10) },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: FONT.md, fontWeight: '700', color: T.text },
  modalSub: { fontSize: rf(11), color: T.textSecondary, marginTop: -rp(4) },
  modalInput: {
    backgroundColor: T.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: rp(12), paddingVertical: rp(10), color: T.text, fontSize: FONT.sm,
  },
  modalSubmit: { height: BUTTON_HEIGHT, borderRadius: RADIUS.md, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center', marginTop: rp(4) },
  modalSubmitText: { color: '#fff', fontSize: FONT.md, fontWeight: '700' },
});
