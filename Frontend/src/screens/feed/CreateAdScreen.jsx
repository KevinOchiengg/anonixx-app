/** Promote a drop or your Room, step by step: what, the ad, who sees it, budget, review and pay.
 * Paid per view from a budget held up front (backend ads.py /ads/campaigns). Same as Web CreateAdPage. */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useSelector } from 'react-redux';
import { ArrowLeft } from 'lucide-react-native';

import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { uploadToR2 } from '../../utils/upload';
import T from '../../utils/theme';
import useDraft from '../../hooks/useDraft';

const STEPS = ['Promote', 'Your ad', 'Audience', 'Budget', 'Review'];
const BUDGETS = [50, 100, 250, 500, 1000];
const GENDERS = [{ id: 'female', label: 'Women' }, { id: 'male', label: 'Men' }, { id: 'nonbinary', label: 'Non-binary' }];

async function call(path, opts = {}) {
  const token = await AsyncStorage.getItem('token');
  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data?.detail;
    const err = new Error(typeof d === 'string' ? d : d?.message || 'Something went wrong.');
    err.status = res.status;
    throw err;
  }
  return data;
}

const Chip = ({ on, label, onPress }) => (
  <TouchableOpacity onPress={onPress} style={[s.chip, on && s.chipOn]} activeOpacity={0.8}>
    <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
  </TouchableOpacity>
);

export default function CreateAdScreen({ navigation }) {
  const { showToast } = useToast();
  const balance = useSelector((st) => st.coins?.balance ?? 0);
  const [rules, setRules] = useState(null);
  const [drops, setDrops] = useState(null);
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState('drop');
  const [dropId, setDropId] = useState(null);
  const [title, setTitle, clearTitle] = useDraft('ad:title', '');
  const [cta, setCta] = useState('Link Up');
  const [media, setMedia] = useState(null);
  const [countries, setCountries] = useState('');
  const [genders, setGenders] = useState([]);
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [budget, setBudget] = useState(100);
  const [daily, setDaily] = useState('');
  const [busy, setBusy] = useState(false);
  const [needCoins, setNeedCoins] = useState(false);

  useEffect(() => {
    call('/ads/campaigns/rules').then(setRules).catch(() => {});
    call('/ads/my-drops').then((r) => setDrops(r.drops || [])).catch(() => setDrops([]));
  }, []);

  const rate = rules?.coins_per_1000 ?? 50;
  const views = Math.floor((budget * 1000) / rate);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
    if (!r.canceled && r.assets?.[0]) setMedia(r.assets[0]);
  };

  const problem = () => {
    if (step === 0 && target === 'drop' && !dropId) return 'Pick the drop you want to promote.';
    if (step === 1 && !title.trim()) return 'Write what your ad says.';
    if (step === 1 && target === 'room' && !media) return 'Add a photo or video for your Room ad.';
    if (step === 2 && ageMin && ageMax && Number(ageMin) > Number(ageMax)) return 'The youngest age has to be under the oldest.';
    return '';
  };

  const next = () => {
    const why = problem();
    if (why) { showToast({ type: 'warning', message: why }); return; }
    setStep((v) => Math.min(v + 1, STEPS.length - 1));
  };

  const submit = async () => {
    setBusy(true); setNeedCoins(false);
    try {
      let media_url = null;
      let media_type = 'image';
      if (media) {
        media_type = media.type === 'video' ? 'video' : 'image';
        media_url = await uploadToR2(media.uri, media_type, media_type === 'video' ? 'video/mp4' : 'image/jpeg');
      }
      await call('/ads/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          target_type: target, drop_id: target === 'drop' ? dropId : null, title: title.trim(), cta, media_url, media_type,
          countries: countries.split(',').map((c) => c.trim()).filter(Boolean), genders,
          age_min: ageMin ? Number(ageMin) : null, age_max: ageMax ? Number(ageMax) : null,
          budget_coins: budget, daily_coins: daily ? Number(daily) : null,
        }),
      });
      clearTitle();
      showToast({ type: 'success', message: `Sent for review. ${budget} coins are held until it runs.` });
      navigation.replace('MyAds');
    } catch (e) {
      if (e.status === 402) setNeedCoins(true);
      showToast({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <View style={s.header}>
      <TouchableOpacity onPress={() => (step > 0 ? setStep(step - 1) : navigation.goBack())} hitSlop={HIT_SLOP}>
        <ArrowLeft size={rs(22)} color={T.text} />
      </TouchableOpacity>
      <Text style={s.headerTitle}>New ad</Text>
      <View style={{ width: rs(22) }} />
    </View>
  );

  if (rules && !rules.can_advertise) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        {header}
        <View style={s.center}><Text style={s.h}>Not yet</Text><Text style={s.muted}>{rules.reason}</Text></View>
      </SafeAreaView>
    );
  }

  const selected = drops?.find((d) => d.id === dropId);
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {header}
      <View style={s.steps}>
        {STEPS.map((label, i) => (
          <View key={label} style={[s.step, i <= step && s.stepDone, i === step && s.stepOn]}>
            <Text style={[s.stepText, i === step && { color: T.primary }]} numberOfLines={1}>{label}</Text>
          </View>
        ))}
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {step === 0 ? (
            <>
              <Text style={s.h}>What do you want to promote?</Text>
              <View style={s.chips}>
                <Chip on={target === 'drop'} label="A drop" onPress={() => { setTarget('drop'); setCta('Link Up'); }} />
                <Chip on={target === 'room'} label="My Room" onPress={() => { setTarget('room'); setCta('Visit my Room'); }} />
              </View>
              {target === 'drop' ? (
                drops === null ? <ActivityIndicator color={T.primary} /> : drops.length === 0 ? (
                  <Text style={s.muted}>You have no live drops. Post one first, or promote your Room.</Text>
                ) : drops.map((d) => (
                  <TouchableOpacity key={d.id} style={[s.option, dropId === d.id && s.optionOn]} onPress={() => setDropId(d.id)} activeOpacity={0.8}>
                    <Text style={s.optionText} numberOfLines={2}>{d.confession || 'Drop with media'}</Text>
                  </TouchableOpacity>
                ))
              ) : <Text style={s.muted}>People who tap your ad land in your Room.</Text>}
            </>
          ) : null}

          {step === 1 ? (
            <>
              <Text style={s.h}>Your ad</Text>
              <TextInput style={[s.input, { minHeight: rs(110) }]} value={title} onChangeText={setTitle} maxLength={900} multiline textAlignVertical="top"
                placeholder="What it says (first line shows in bold)" placeholderTextColor={T.textMuted} />
              <TouchableOpacity style={s.ghostBtn} onPress={pick} activeOpacity={0.85}>
                <Text style={s.ghostText}>{media ? `${media.type === 'video' ? 'Video' : 'Photo'} picked · change` : target === 'drop' ? "Add a photo or video (or use the drop's)" : 'Add a photo or video'}</Text>
              </TouchableOpacity>
              {media && media.type !== 'video' ? <Image source={{ uri: media.uri }} style={s.preview} /> : null}
              <Text style={s.label}>Button</Text>
              <View style={s.chips}>
                {(rules?.ctas || ['Link Up', 'See more', 'Visit my Room']).map((c) => <Chip key={c} on={cta === c} label={c} onPress={() => setCta(c)} />)}
              </View>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Text style={s.h}>Who sees it</Text>
              <Text style={s.muted}>Leave anything blank to reach everyone.</Text>
              <Text style={s.label}>Gender</Text>
              <View style={s.chips}>
                {GENDERS.map((g) => (
                  <Chip key={g.id} on={genders.includes(g.id)} label={g.label}
                    onPress={() => setGenders((cur) => (cur.includes(g.id) ? cur.filter((x) => x !== g.id) : [...cur, g.id]))} />
                ))}
              </View>
              <Text style={s.label}>Age</Text>
              <View style={s.row}>
                <TextInput style={[s.input, { flex: 1 }]} value={ageMin} onChangeText={(v) => setAgeMin(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="From 18" placeholderTextColor={T.textMuted} />
                <TextInput style={[s.input, { flex: 1 }]} value={ageMax} onChangeText={(v) => setAgeMax(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="To any" placeholderTextColor={T.textMuted} />
              </View>
              <Text style={s.label}>Countries</Text>
              <TextInput style={s.input} value={countries} onChangeText={setCountries} placeholder="Everywhere, or e.g. Kenya, Nigeria" placeholderTextColor={T.textMuted} />
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Text style={s.h}>Budget</Text>
              <View style={s.chips}>{BUDGETS.map((b) => <Chip key={b} on={budget === b} label={`${b} coins`} onPress={() => setBudget(b)} />)}</View>
              <Text style={s.est}>About <Text style={{ color: T.primary }}>{views.toLocaleString()}</Text> views</Text>
              <Text style={s.muted}>{rate} coins per 1,000 views. You pay only for views you get; whatever is left comes back when you stop the ad.</Text>
              <Text style={s.label}>Daily limit (optional)</Text>
              <TextInput style={s.input} value={daily} onChangeText={(v) => setDaily(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Coins per day" placeholderTextColor={T.textMuted} />
            </>
          ) : null}

          {step === 4 ? (
            <>
              <Text style={s.h}>Review</Text>
              {[
                ['Promoting', target === 'room' ? 'Your Room' : (selected?.confession || 'Your drop').slice(0, 80)],
                ['Says', title],
                ['Button', cta],
                ['Audience', [genders.length ? genders.map((g) => GENDERS.find((x) => x.id === g)?.label).join(', ') : 'Everyone', ageMin || ageMax ? `${ageMin || 18}–${ageMax || 'any'}` : '', countries || 'everywhere'].filter(Boolean).join(' · ')],
                ['Budget', `${budget} coins · about ${views.toLocaleString()} views${daily ? ` · up to ${daily} a day` : ''}`],
                ['Your coins', String(balance)],
              ].map(([k, v]) => (
                <View key={k} style={s.reviewRow}><Text style={s.reviewKey}>{k}</Text><Text style={s.reviewVal}>{v}</Text></View>
              ))}
              <Text style={s.muted}>We review every ad before it runs. Rejected, every coin comes back.</Text>
              {needCoins ? (
                <TouchableOpacity style={s.ghostBtn} onPress={() => navigation.navigate('Coins')}><Text style={s.ghostText}>Get coins</Text></TouchableOpacity>
              ) : null}
            </>
          ) : null}
        </ScrollView>
        <View style={s.foot}>
          {step < STEPS.length - 1 ? (
            <TouchableOpacity style={s.primary} onPress={next} activeOpacity={0.85}><Text style={s.primaryText}>Next</Text></TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.primary} onPress={submit} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Send for review · {budget} coins</Text>}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: rp(12) },
  headerTitle: { color: T.text, fontSize: FONT.md, fontWeight: '700', fontFamily: 'PlayfairDisplay-Bold' },
  steps: { flexDirection: 'row', gap: rp(4), paddingHorizontal: SPACING.md },
  step: { flex: 1, paddingBottom: rp(6), borderBottomWidth: 3, borderBottomColor: T.border, alignItems: 'center' },
  stepDone: { borderBottomColor: 'rgba(255,99,74,0.45)' },
  stepOn: { borderBottomColor: T.primary },
  stepText: { color: T.textSecondary, fontSize: rf(10), fontWeight: '700' },
  body: { padding: SPACING.md, gap: rp(12), paddingBottom: rs(40) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg, gap: rp(8) },
  h: { color: T.text, fontSize: rf(18), fontWeight: '800' },
  label: { color: T.textSecondary, fontSize: rf(12), fontWeight: '700', marginTop: rp(4) },
  muted: { color: T.textSecondary, fontSize: FONT.sm, lineHeight: rf(19) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8) },
  chip: { paddingHorizontal: rp(14), paddingVertical: rp(9), borderRadius: RADIUS.full, borderWidth: 1, borderColor: T.border },
  chipOn: { borderColor: T.primary, backgroundColor: 'rgba(255,99,74,0.12)' },
  chipText: { color: T.textSecondary, fontSize: FONT.sm, fontWeight: '700' },
  chipTextOn: { color: T.primary },
  option: { padding: rp(12), borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border },
  optionOn: { borderColor: T.primary, backgroundColor: 'rgba(255,99,74,0.08)' },
  optionText: { color: T.text, fontSize: FONT.sm },
  input: { color: T.text, fontSize: FONT.sm, borderWidth: 1, borderColor: T.border, borderRadius: RADIUS.md, paddingHorizontal: rp(12), paddingVertical: rp(10), backgroundColor: 'rgba(255,255,255,0.03)' },
  row: { flexDirection: 'row', gap: rp(10) },
  ghostBtn: { paddingVertical: rp(12), borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border, alignItems: 'center' },
  ghostText: { color: T.text, fontSize: FONT.sm, fontWeight: '700' },
  preview: { width: '100%', height: rs(200), borderRadius: RADIUS.md },
  est: { color: T.text, fontSize: rf(18), fontWeight: '800' },
  reviewRow: { flexDirection: 'row', gap: rp(12), paddingVertical: rp(8), borderBottomWidth: 1, borderBottomColor: T.border },
  reviewKey: { width: rs(90), color: T.textSecondary, fontSize: FONT.sm },
  reviewVal: { flex: 1, color: T.text, fontSize: FONT.sm },
  foot: { padding: SPACING.md },
  primary: { height: rs(50), borderRadius: RADIUS.full, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: FONT.md, fontWeight: '800' },
});
