/**
 * DashboardScreen.jsx
 *
 * The user's advanced dashboard, reachable from Profile ("You" tab) →
 * Dashboard. Everything here is real data pulled from endpoints that
 * mostly already existed but had no frontend: /posts/mine (new — added
 * alongside this screen), /impact/dashboard (built, never wired to any
 * UI), /coins/balance + /coins/transactions, and /coins/withdraw +
 * /coins/withdraw/history (the actual coins-to-cash mechanic — already
 * built server-side, this is its first UI).
 *
 * Sections:
 *   Overview   — coins, total views, total posts at a glance
 *   My Posts   — edit / delete your own posts
 *   Activity   — people supported, responses received, milestones
 *   Coins      — balance, transaction history, request a cash withdrawal
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Modal, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Coins, Eye, FileText, Heart, HandHeart, Bookmark,
  Trash2, Edit3, X, Wallet, Clock, CheckCircle2, XCircle,
} from 'lucide-react-native';

import { THEME } from '../../utils/theme';
import { rs, rf, rp, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';

const MIN_WITHDRAWAL_COINS = 100;

// ─── Small pieces ───────────────────────────────────────────────
const StatCard = React.memo(({ icon: Icon, value, label, color }) => (
  <View style={s.statCard}>
    <Icon size={rs(16)} color={color || THEME.primary} strokeWidth={1.8} />
    <Text style={s.statValue}>{value}</Text>
    <Text style={s.statLabel}>{label}</Text>
  </View>
));

const SectionHeader = React.memo(({ title }) => (
  <Text style={s.sectionTitle}>{title}</Text>
));

const WITHDRAW_STATUS_META = {
  pending: { icon: Clock, color: THEME.warning, label: 'Pending' },
  paid:    { icon: CheckCircle2, color: THEME.success, label: 'Paid' },
  rejected: { icon: XCircle, color: THEME.error, label: 'Rejected' },
};

export default function DashboardScreen({ navigation }) {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [balance, setBalance] = useState(0);
  const [estimatedKes, setEstimatedKes] = useState(0);
  const [payoutRate, setPayoutRate] = useState(0);
  const [posts, setPosts] = useState([]);
  const [totalViews, setTotalViews] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [activity, setActivity] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);

  const [editingPost, setEditingPost] = useState(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawPhone, setWithdrawPhone] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  const authHeaders = useCallback(async (json = false) => {
    const token = await AsyncStorage.getItem('token');
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const headers = await authHeaders();
      const [balRes, postsRes, txRes, actRes, wdRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/coins/balance`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/posts/mine`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/coins/transactions`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/impact/dashboard`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/coins/withdraw/history`, { headers }),
      ]);
      if (balRes.ok) {
        const balData = await balRes.json();
        setBalance(balData.balance || 0);
        setEstimatedKes(balData.estimated_kes || 0);
        setPayoutRate(balData.payout_rate_kes_per_coin || 0);
      }
      if (postsRes.ok) {
        const data = await postsRes.json();
        setPosts(data.posts || []);
        setTotalViews(data.total_views || 0);
      }
      if (txRes.ok) setTransactions((await txRes.json()) || []);
      if (actRes.ok) setActivity(await actRes.json());
      if (wdRes.ok) setWithdrawals((await wdRes.json()) || []);
    } catch {
      showToast({ type: 'error', message: 'Could not load your dashboard.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authHeaders, showToast]);

  useEffect(() => { load(); }, [load]);

  // ── Post edit / delete ─────────────────────────────────────
  const openEdit = useCallback((post) => {
    setEditingPost(post);
    setEditText(post.content);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editText.trim() || !editingPost) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/posts/${editingPost.id}`, {
        method: 'PATCH',
        headers: await authHeaders(true),
        body: JSON.stringify({ content: editText.trim() }),
      });
      if (res.ok) {
        setPosts((prev) => prev.map((p) => (p.id === editingPost.id ? { ...p, content: editText.trim() } : p)));
        showToast({ type: 'success', message: 'Updated. Still yours.' });
        setEditingPost(null);
      } else {
        const data = await res.json().catch(() => ({}));
        showToast({ type: 'error', message: data.detail || 'Could not update drop.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not update drop. Try again.' });
    } finally {
      setSavingEdit(false);
    }
  }, [editText, editingPost, authHeaders, showToast]);

  const handleDelete = useCallback((post) => {
    Alert.alert(
      'Delete this drop?',
      'This removes it everywhere, permanently.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeletingId(post.id);
            try {
              const res = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}`, {
                method: 'DELETE',
                headers: await authHeaders(),
              });
              if (res.ok) {
                setPosts((prev) => prev.filter((p) => p.id !== post.id));
                showToast({ type: 'success', message: 'Gone for good.' });
              } else {
                showToast({ type: 'error', message: 'Could not delete drop.' });
              }
            } catch {
              showToast({ type: 'error', message: 'Could not delete drop. Try again.' });
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  }, [authHeaders, showToast]);

  // ── Withdraw ──────────────────────────────────────────────
  const handleWithdraw = useCallback(async () => {
    const amount = parseInt(withdrawAmount, 10);
    if (!amount || amount < MIN_WITHDRAWAL_COINS) {
      showToast({ type: 'warning', message: `Minimum withdrawal is ${MIN_WITHDRAWAL_COINS} coins.` });
      return;
    }
    if (!withdrawPhone.trim()) {
      showToast({ type: 'warning', message: 'Add the M-Pesa number to pay out to.' });
      return;
    }
    setWithdrawing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/coins/withdraw`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ amount_coins: amount, mpesa_number: withdrawPhone.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setBalance(data.new_balance);
        setWithdrawOpen(false);
        setWithdrawAmount(''); setWithdrawPhone('');
        showToast({
          type: 'success',
          message: `Withdrawal requested — ≈ KES ${data.estimated_kes} — paid out manually within a few days.`,
        });
        load(true);
      } else if (res.status === 402) {
        showToast({ type: 'warning', message: data.detail || 'Not enough coins.' });
      } else {
        showToast({ type: 'error', message: data.detail || 'Could not request withdrawal.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not request withdrawal. Try again.' });
    } finally {
      setWithdrawing(false);
    }
  }, [withdrawAmount, withdrawPhone, authHeaders, showToast, load]);

  if (loading) {
    return (
      <SafeAreaView style={[s.safe, s.centered]}>
        <ActivityIndicator color={THEME.primary} size="large" />
      </SafeAreaView>
    );
  }

  const impact = activity?.all_time;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} style={s.headerBtn}>
          <ArrowLeft size={rs(20)} color={THEME.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Your Drops</Text>
        <View style={s.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={THEME.primary} colors={[THEME.primary]} />}
      >
        {/* Overview */}
        <View style={s.statsRow}>
          <StatCard icon={Coins} value={balance} label="Coins" color={THEME.warning} />
          <StatCard icon={Eye} value={totalViews} label="Total views" />
          <StatCard icon={FileText} value={posts.length} label="Drops" />
        </View>

        {/* My Posts */}
        <SectionHeader title="My Drops" />
        {posts.length === 0 ? (
          <Text style={s.emptyText}>You haven't dropped anything yet.</Text>
        ) : (
          <View style={s.card}>
            {posts.map((post, idx) => (
              <View key={post.id} style={[s.postRow, idx === posts.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={s.postInfo}>
                  <Text style={s.postContent} numberOfLines={2}>{post.content || '(media drop)'}</Text>
                  <View style={s.postMetaRow}>
                    <Eye size={rs(11)} color={THEME.textMuted} />
                    <Text style={s.postMetaText}>{post.views_count}</Text>
                    <Heart size={rs(11)} color={THEME.textMuted} style={{ marginLeft: rp(8) }} />
                    <Text style={s.postMetaText}>{post.likes_count}</Text>
                    <Text style={s.postMetaDot}>·</Text>
                    <Text style={s.postMetaText}>{post.time_ago}</Text>
                    {post.edited_at && <Text style={s.postMetaText}> · edited</Text>}
                  </View>
                </View>
                <View style={s.postActions}>
                  <TouchableOpacity onPress={() => openEdit(post)} hitSlop={HIT_SLOP} style={s.postActionBtn}>
                    <Edit3 size={rs(15)} color={THEME.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(post)}
                    hitSlop={HIT_SLOP}
                    style={s.postActionBtn}
                    disabled={deletingId === post.id}
                  >
                    {deletingId === post.id
                      ? <ActivityIndicator size="small" color={THEME.error} />
                      : <Trash2 size={rs(15)} color={THEME.error} />}
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Activity Center */}
        <SectionHeader title="Activity Center" />
        <View style={s.activityGrid}>
          <StatCard icon={HandHeart} value={impact?.people_supported ?? 0} label="People supported" color="#a855f7" />
          <StatCard icon={Heart} value={impact?.responses_received ?? 0} label="Replies received" color={THEME.primary} />
          <StatCard icon={Bookmark} value={impact?.saves_received ?? 0} label="Saves received" color="#3b82f6" />
        </View>
        {activity?.milestones?.length > 0 && (
          <View style={s.milestoneRow}>
            {activity.milestones.map((m) => (
              <View key={m.name} style={s.milestoneChip}>
                <Text style={s.milestoneEmoji}>{m.icon}</Text>
                <Text style={s.milestoneLabel}>{m.name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Coins & Earnings */}
        <SectionHeader title="Coins & Earnings" />
        <View style={s.walletCard}>
          <View>
            <Text style={s.walletLabel}>Available balance</Text>
            <Text style={s.walletBalance}>{balance} coins</Text>
            {estimatedKes > 0 && <Text style={s.walletKesEstimate}>≈ KES {estimatedKes.toLocaleString()}</Text>}
          </View>
          <TouchableOpacity style={s.withdrawBtn} onPress={() => setWithdrawOpen(true)} activeOpacity={0.85}>
            <Wallet size={rs(15)} color="#fff" />
            <Text style={s.withdrawBtnText}>Withdraw</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.walletHint}>
          Cash out coins to M-Pesa — minimum {MIN_WITHDRAWAL_COINS} coins{payoutRate > 0 ? ` (≈ KES ${payoutRate} per coin)` : ''}. Requests are reviewed and paid out manually, not instant.
        </Text>

        {transactions.length > 0 && (
          <View style={s.card}>
            {transactions.slice(0, 8).map((tx, idx) => (
              <View key={tx.id} style={[s.txRow, idx === Math.min(transactions.length, 8) - 1 && { borderBottomWidth: 0 }]}>
                <Text style={s.txDesc} numberOfLines={1}>{tx.description || tx.reason}</Text>
                <Text style={[s.txAmount, { color: tx.amount > 0 ? THEME.success : THEME.error }]}>
                  {tx.amount > 0 ? '+' : ''}{tx.amount}
                </Text>
              </View>
            ))}
          </View>
        )}

        {withdrawals.length > 0 && (
          <>
            <SectionHeader title="Withdrawal history" />
            <View style={s.card}>
              {withdrawals.map((w, idx) => {
                const meta = WITHDRAW_STATUS_META[w.status] || WITHDRAW_STATUS_META.pending;
                const StatusIcon = meta.icon;
                return (
                  <View key={w.id} style={[s.txRow, idx === withdrawals.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.txDesc}>{w.amount_coins} coins → {w.mpesa_number}</Text>
                      {w.estimated_kes > 0 && <Text style={s.txSubDesc}>≈ KES {w.estimated_kes}</Text>}
                    </View>
                    <View style={s.withdrawStatus}>
                      <StatusIcon size={rs(12)} color={meta.color} />
                      <Text style={[s.withdrawStatusText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* Edit post modal */}
      <Modal visible={!!editingPost} transparent animationType="slide" onRequestClose={() => setEditingPost(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Edit drop</Text>
              <TouchableOpacity onPress={() => setEditingPost(null)} hitSlop={HIT_SLOP}>
                <X size={rs(20)} color={THEME.textMuted} />
              </TouchableOpacity>
            </View>
            <TextInput
              value={editText}
              onChangeText={setEditText}
              style={s.modalInput}
              multiline
              maxLength={500}
              placeholderTextColor={THEME.textMuted}
            />
            <TouchableOpacity
              style={[s.modalSubmit, (!editText.trim() || savingEdit) && { opacity: 0.5 }]}
              onPress={handleSaveEdit}
              disabled={!editText.trim() || savingEdit}
            >
              {savingEdit ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.modalSubmitText}>Save changes</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Withdraw modal */}
      <Modal visible={withdrawOpen} transparent animationType="slide" onRequestClose={() => setWithdrawOpen(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Withdraw coins</Text>
              <TouchableOpacity onPress={() => setWithdrawOpen(false)} hitSlop={HIT_SLOP}>
                <X size={rs(20)} color={THEME.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalHint}>You have {balance} coins available. Minimum {MIN_WITHDRAWAL_COINS} coins per request.</Text>
            <TextInput
              value={withdrawAmount}
              onChangeText={(v) => setWithdrawAmount(v.replace(/[^0-9]/g, ''))}
              placeholder="Amount in coins"
              placeholderTextColor={THEME.textMuted}
              style={s.modalInputSingle}
              keyboardType="number-pad"
            />
            {!!withdrawAmount && payoutRate > 0 && (
              <Text style={s.modalEstimate}>≈ KES {(parseInt(withdrawAmount, 10) * payoutRate).toFixed(2)}</Text>
            )}
            <TextInput
              value={withdrawPhone}
              onChangeText={setWithdrawPhone}
              placeholder="M-Pesa number (2547XXXXXXXX)"
              placeholderTextColor={THEME.textMuted}
              style={s.modalInputSingle}
              keyboardType="phone-pad"
              maxLength={12}
            />
            <TouchableOpacity
              style={[s.modalSubmit, withdrawing && { opacity: 0.5 }]}
              onPress={handleWithdraw}
              disabled={withdrawing}
            >
              {withdrawing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.modalSubmitText}>Request withdrawal</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: rp(16), paddingVertical: rp(12),
    borderBottomWidth: 1, borderBottomColor: THEME.border,
  },
  headerBtn: { width: rs(32) },
  headerTitle: { fontSize: rf(18), fontWeight: '700', color: THEME.text },

  content: { padding: rp(16), paddingBottom: rp(60), gap: rp(6) },

  statsRow: { flexDirection: 'row', gap: rp(10), marginBottom: rp(20) },
  statCard: {
    flex: 1, backgroundColor: THEME.surface, borderRadius: rs(14),
    padding: rp(14), alignItems: 'center', gap: rp(6),
    borderWidth: 1, borderColor: THEME.border,
  },
  statValue: { fontSize: rf(18), fontWeight: '800', color: THEME.text },
  statLabel: { fontSize: rf(10), color: THEME.textSecondary, textAlign: 'center' },

  sectionTitle: {
    fontSize: rf(12), fontWeight: '700', color: THEME.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginTop: rp(14), marginBottom: rp(10),
  },
  emptyText: { fontSize: rf(13), color: THEME.textMuted, fontStyle: 'italic' },

  card: {
    backgroundColor: THEME.surface, borderRadius: rs(14),
    borderWidth: 1, borderColor: THEME.border, overflow: 'hidden',
  },

  postRow: {
    flexDirection: 'row', alignItems: 'center', gap: rp(10),
    padding: rp(14), borderBottomWidth: 1, borderBottomColor: THEME.border,
  },
  postInfo: { flex: 1, gap: rp(4) },
  postContent: { fontSize: rf(13), color: THEME.text, lineHeight: rf(18) },
  postMetaRow: { flexDirection: 'row', alignItems: 'center', gap: rp(3) },
  postMetaText: { fontSize: rf(10), color: THEME.textMuted },
  postMetaDot: { fontSize: rf(10), color: THEME.textMuted, marginHorizontal: rp(4) },
  postActions: { flexDirection: 'row', gap: rp(8) },
  postActionBtn: {
    width: rs(30), height: rs(30), borderRadius: rs(15),
    alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.background,
  },

  activityGrid: { flexDirection: 'row', gap: rp(10) },
  milestoneRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8), marginTop: rp(12) },
  milestoneChip: {
    flexDirection: 'row', alignItems: 'center', gap: rp(5),
    backgroundColor: THEME.surface, borderWidth: 1, borderColor: THEME.border,
    borderRadius: rs(999), paddingHorizontal: rp(10), paddingVertical: rp(6),
  },
  milestoneEmoji: { fontSize: rf(13) },
  milestoneLabel: { fontSize: rf(11), color: THEME.textSecondary, fontWeight: '600' },

  walletCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: THEME.surface, borderRadius: rs(14), borderWidth: 1, borderColor: THEME.border,
    padding: rp(16),
  },
  walletLabel: { fontSize: rf(11), color: THEME.textSecondary },
  walletBalance: { fontSize: rf(22), fontWeight: '800', color: THEME.text, marginTop: rp(2) },
  walletKesEstimate: { fontSize: rf(11), color: THEME.success, marginTop: rp(2), fontWeight: '600' },
  withdrawBtn: {
    flexDirection: 'row', alignItems: 'center', gap: rp(6),
    backgroundColor: THEME.primary, borderRadius: rs(10),
    paddingHorizontal: rp(14), paddingVertical: rp(10),
  },
  withdrawBtnText: { color: '#fff', fontSize: rf(13), fontWeight: '700' },
  walletHint: { fontSize: rf(11), color: THEME.textMuted, marginTop: rp(8), lineHeight: rf(16) },

  txRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: rp(13), borderBottomWidth: 1, borderBottomColor: THEME.border, gap: rp(10),
  },
  txDesc: { flex: 1, fontSize: rf(12), color: THEME.text },
  txSubDesc: { fontSize: rf(10), color: THEME.textMuted, marginTop: rp(1) },
  txAmount: { fontSize: rf(13), fontWeight: '700' },
  withdrawStatus: { flexDirection: 'row', alignItems: 'center', gap: rp(4) },
  withdrawStatusText: { fontSize: rf(11), fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: THEME.background, borderTopLeftRadius: rs(22), borderTopRightRadius: rs(22),
    padding: rp(18), gap: rp(12), borderWidth: 1, borderColor: THEME.border, borderBottomWidth: 0,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: rf(17), fontWeight: '700', color: THEME.text },
  modalHint: { fontSize: rf(11), color: THEME.textMuted, marginTop: -rp(4) },
  modalEstimate: { fontSize: rf(12), color: THEME.success, fontWeight: '700', marginTop: -rp(6) },
  modalInput: {
    backgroundColor: THEME.surface, borderRadius: rs(10), borderWidth: 1, borderColor: THEME.border,
    padding: rp(12), color: THEME.text, fontSize: rf(14), minHeight: rs(90), textAlignVertical: 'top',
  },
  modalInputSingle: {
    backgroundColor: THEME.surface, borderRadius: rs(10), borderWidth: 1, borderColor: THEME.border,
    padding: rp(12), color: THEME.text, fontSize: rf(14),
  },
  modalSubmit: {
    backgroundColor: THEME.primary, borderRadius: rs(10),
    alignItems: 'center', justifyContent: 'center', paddingVertical: rp(14), marginBottom: rp(6),
  },
  modalSubmitText: { color: '#fff', fontSize: rf(14), fontWeight: '700' },
});
