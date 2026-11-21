import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, BadgeCheck, Clock } from 'lucide-react-native';
import PayoutForm from '../../components/lives/PayoutForm';
import { livesApi, money } from '../../utils/lives';
import { HIT_SLOP, RADIUS, rf, rp, rs } from '../../utils/responsive';
import T from '../../utils/theme';

const STATUS = { in_progress: 'This week', due: 'Paying soon', paid: 'Paid' };
const STATUS_COLOR = { in_progress: T.textSecondary, due: T.gold, paid: '#34D399' };

function weekLabel(iso) {
  const start = new Date(iso);
  const end = new Date(start.getTime() + 6 * 86400000);
  const fmt = (d) => d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function LiveEarningsScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await livesApi.earnings()); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} accessibilityLabel="Back"><ArrowLeft size={rs(22)} color={T.text} /></TouchableOpacity>
        <Text style={s.heading}>Earnings</Text>
        <View style={{ width: rs(22) }} />
      </View>
      {!data && !error ? <ActivityIndicator color={T.primary} style={{ marginTop: rp(40) }} /> : (
        <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} />}>
          {!!error && <Text style={s.error}>{error}</Text>}
          {data && (
            <>
              <View style={s.owed}>
                <Text style={s.owedLabel}>Waiting to be paid</Text>
                <Text style={s.owedValue}>{money(data.owed_amount, data.currency)}</Text>
                <Text style={s.owedNote}>
                  {data.owed_coins} coins · paid every week. You keep {Math.round(data.host_share * 100)}% of entry fees and all gifts.
                </Text>
              </View>

              <Text style={s.section}>Payout details</Text>
              {data.profile && !editing ? (
                <View style={s.profile}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.profileName}>{data.profile.legal_name}</Text>
                    <Text style={s.profileSub}>{data.profile.destination} · ID ending {data.profile.id_number_last4}</Text>
                  </View>
                  <View style={s.verify}>
                    {data.profile.verified ? <BadgeCheck size={rs(14)} color="#34D399" /> : <Clock size={rs(14)} color={T.gold} />}
                    <Text style={[s.verifyText, { color: data.profile.verified ? '#34D399' : T.gold }]}>{data.profile.verified ? 'Verified' : 'Checking'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setEditing(true)} hitSlop={HIT_SLOP}><Text style={s.edit}>Edit</Text></TouchableOpacity>
                </View>
              ) : (
                <PayoutForm initial={data.profile} onSaved={() => { setEditing(false); load(); }} />
              )}

              <Text style={s.section}>By week</Text>
              {data.weeks.length ? data.weeks.map((w) => (
                <View key={w.week} style={s.week}>
                  <Text style={s.weekLabel}>{weekLabel(w.week)}</Text>
                  <Text style={s.weekValue}>{money(w.amount, data.currency)}</Text>
                  <Text style={[s.weekStatus, { color: STATUS_COLOR[w.status] }]}>{STATUS[w.status]}</Text>
                </View>
              )) : <Text style={s.muted}>No earnings yet. Go live to start earning.</Text>}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: rp(16), paddingVertical: rp(12) },
  heading: { fontFamily: 'DMSans-Bold', fontSize: rf(17), color: T.text },
  body: { padding: rp(16), paddingBottom: rp(40), gap: rp(8) },
  error: { color: T.danger, fontFamily: 'DMSans-Regular', fontSize: rf(14) },
  owed: { padding: rp(18), borderRadius: RADIUS.lg, backgroundColor: T.surface, borderWidth: 1, borderColor: T.primaryBorder || T.border, gap: rp(4) },
  owedLabel: { fontFamily: 'DMSans-Regular', fontSize: rf(13), color: T.textSecondary },
  owedValue: { fontFamily: 'DMSans-Bold', fontSize: rf(30), color: T.text },
  owedNote: { fontFamily: 'DMSans-Regular', fontSize: rf(12), color: T.textSecondary },
  section: { fontFamily: 'DMSans-Bold', fontSize: rf(16), color: T.text, marginTop: rp(18), marginBottom: rp(4) },
  profile: { flexDirection: 'row', alignItems: 'center', gap: rp(12), padding: rp(14), borderRadius: RADIUS.md, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  profileName: { fontFamily: 'DMSans-Bold', fontSize: rf(14), color: T.text },
  profileSub: { fontFamily: 'DMSans-Regular', fontSize: rf(12), color: T.textSecondary, marginTop: rp(2) },
  verify: { flexDirection: 'row', alignItems: 'center', gap: rp(4) },
  verifyText: { fontFamily: 'DMSans-Bold', fontSize: rf(12) },
  edit: { fontFamily: 'DMSans-Bold', fontSize: rf(13), color: T.primary },
  week: { flexDirection: 'row', alignItems: 'center', gap: rp(12), padding: rp(14), borderRadius: RADIUS.md, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  weekLabel: { flex: 1, fontFamily: 'DMSans-Regular', fontSize: rf(14), color: T.text },
  weekValue: { fontFamily: 'DMSans-Bold', fontSize: rf(14), color: T.text },
  weekStatus: { fontFamily: 'DMSans-Bold', fontSize: rf(12) },
  muted: { fontFamily: 'DMSans-Regular', fontSize: rf(14), color: T.textSecondary },
});
