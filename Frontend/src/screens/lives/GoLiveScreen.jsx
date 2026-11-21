import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, CalendarClock, Coins, ImagePlus, Radio } from 'lucide-react-native';
import PayoutForm from '../../components/lives/PayoutForm';
import { useToast } from '../../components/ui/Toast';
import { confirm } from '../../utils/confirm';
import { livesApi, startsLabel } from '../../utils/lives';
import { uploadToR2 } from '../../utils/upload';
import { HIT_SLOP, RADIUS, rf, rp, rs } from '../../utils/responsive';
import T from '../../utils/theme';

const PRICE_PRESETS = [5, 10, 20, 50];

function at(dayOffset, hour) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function schedulePresets() {
  const now = new Date();
  const inAnHour = new Date(now.getTime() + 60 * 60 * 1000);
  const tonight = at(0, 21);
  const saturday = at((6 - now.getDay() + 7) % 7 || 7, 21);
  return [
    { key: 'hour', label: 'In 1 hour', date: inAnHour },
    ...(tonight > inAnHour ? [{ key: 'tonight', label: 'Tonight, 9 PM', date: tonight }] : []),
    { key: 'tomorrow', label: 'Tomorrow, 9 PM', date: at(1, 21) },
    { key: 'saturday', label: 'Saturday, 9 PM', date: saturday },
  ];
}

export default function GoLiveScreen({ navigation }) {
  const { showToast } = useToast();
  const [profile, setProfile] = useState(undefined);
  const [title, setTitle] = useState('');
  const [about, setAbout] = useState('');
  const [price, setPrice] = useState(10);
  const [when, setWhen] = useState('now');
  const [cover, setCover] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const presets = useMemo(schedulePresets, []);

  useEffect(() => {
    livesApi.payoutProfile().then((r) => setProfile(r.profile)).catch(() => setProfile(null));
  }, []);

  const pickCover = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [3, 4] });
    if (r.canceled || !r.assets?.[0]) return;
    setUploading(true);
    try { setCover(await uploadToR2(r.assets[0].uri, 'image', 'image/jpeg')); } catch (e) { showToast({ type: 'error', message: e.message || 'Upload failed.' }); } finally { setUploading(false); }
  };

  const submit = async () => {
    const later = when === 'now' ? null : presets.find((p) => p.key === when)?.date;
    const ok = await confirm({
      title: later ? 'Schedule this live?' : 'Go live now?',
      message: later
        ? `Starts ${startsLabel(later.toISOString())}. Followers and anyone who taps Remind me get notified when you start.`
        : 'Your camera and mic turn on. Viewers get a 30-second preview, then pay to stay.',
      rows: [
        { label: 'Entry price', value: `${price} coins`, highlight: true },
        { label: 'You keep', value: '80% + all gifts' },
      ],
      confirmLabel: later ? 'Schedule' : 'Go live',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { live } = await livesApi.create({
        title: title.trim(), about: about.trim() || undefined, cover_url: cover || undefined, price,
        starts_at: later ? later.toISOString() : null,
      });
      navigation.replace('LiveRoom', { liveId: live.id, autoStart: !later });
    } catch (e) {
      if (e.code === 'payout_profile_required') setProfile(null);
      showToast({ type: 'error', message: e.message });
      setBusy(false);
    }
  };

  const header = (label) => (
    <View style={s.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} accessibilityLabel="Back"><ArrowLeft size={rs(22)} color={T.text} /></TouchableOpacity>
      <Text style={s.heading}>{label}</Text>
      <View style={{ width: rs(22) }} />
    </View>
  );

  if (profile === undefined) {
    return <SafeAreaView style={s.safe}>{header('Go live')}<ActivityIndicator color={T.primary} style={{ marginTop: rp(40) }} /></SafeAreaView>;
  }

  if (!profile) {
    return (
      <SafeAreaView style={s.safe}>
        {header('Payout details')}
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <Text style={s.h2}>Get paid for your lives</Text>
          <PayoutForm onSaved={setProfile} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const ready = title.trim().length >= 3 && !uploading && !busy;

  return (
    <SafeAreaView style={s.safe}>
      {header('Go live')}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={s.coverPick} onPress={pickCover} disabled={uploading} activeOpacity={0.85}>
            {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} /> : (
              <View style={s.coverInner}>
                {uploading ? <ActivityIndicator color={T.primary} /> : <ImagePlus size={rs(22)} color={T.textSecondary} />}
                <Text style={s.coverText}>{uploading ? 'Uploading…' : 'Add a cover (optional)'}</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={s.label}>Title</Text>
          <TextInput style={s.input} value={title} onChangeText={setTitle} maxLength={80} placeholder="What's this live about?" placeholderTextColor={T.textMuted} />
          <Text style={s.label}>About <Text style={s.optional}>optional</Text></Text>
          <TextInput style={[s.input, s.multi]} value={about} onChangeText={setAbout} maxLength={300} multiline placeholder="Tell people why they should join" placeholderTextColor={T.textMuted} textAlignVertical="top" />

          <Text style={s.label}>Entry price</Text>
          <View style={s.chips}>
            {PRICE_PRESETS.map((p) => (
              <TouchableOpacity key={p} style={[s.chip, price === p && s.chipOn]} onPress={() => setPrice(p)}>
                <Coins size={rs(14)} color={T.gold} /><Text style={[s.chipText, price === p && s.chipTextOn]}>{p}</Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={[s.input, s.priceInput]} keyboardType="number-pad" value={String(price)} maxLength={3}
              onChangeText={(v) => setPrice(Math.max(1, Math.min(500, Number(v.replace(/\D/g, '')) || 1)))} accessibilityLabel="Custom price in coins"
            />
          </View>
          <Text style={s.hint}>Everyone gets a free 30-second preview first. You keep 80% of entry fees and all gifts.</Text>

          <Text style={s.label}>When</Text>
          <View style={s.chips}>
            <TouchableOpacity style={[s.chip, when === 'now' && s.chipOn]} onPress={() => setWhen('now')}>
              <Radio size={rs(14)} color={when === 'now' ? T.primary : T.textSecondary} /><Text style={[s.chipText, when === 'now' && s.chipTextOn]}>Now</Text>
            </TouchableOpacity>
            {presets.map((p) => (
              <TouchableOpacity key={p.key} style={[s.chip, when === p.key && s.chipOn]} onPress={() => setWhen(p.key)}>
                <CalendarClock size={rs(14)} color={when === p.key ? T.primary : T.textSecondary} /><Text style={[s.chipText, when === p.key && s.chipTextOn]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={[s.submit, !ready && { opacity: 0.5 }]} onPress={submit} disabled={!ready} activeOpacity={0.88}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>{when === 'now' ? 'Go live' : 'Schedule live'}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: rp(16), paddingVertical: rp(12) },
  heading: { fontFamily: 'DMSans-Bold', fontSize: rf(17), color: T.text },
  body: { padding: rp(16), paddingBottom: rp(40), gap: rp(8) },
  h2: { fontFamily: 'PlayfairDisplay-Bold', fontSize: rf(20), color: T.text, marginBottom: rp(6) },
  coverPick: { aspectRatio: 16 / 9, borderRadius: RADIUS.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: T.border, backgroundColor: T.surface, overflow: 'hidden', marginBottom: rp(6) },
  coverInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: rp(6) },
  coverText: { fontFamily: 'DMSans-Regular', fontSize: rf(13), color: T.textSecondary },
  label: { fontFamily: 'DMSans-SemiBold', fontSize: rf(14), color: T.text, marginTop: rp(8) },
  optional: { fontFamily: 'DMSans-Regular', color: T.textMuted, fontSize: rf(12) },
  input: {
    fontFamily: 'DMSans-Regular', fontSize: rf(15), color: T.text, backgroundColor: T.surface,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border, paddingHorizontal: rp(14), paddingVertical: rp(12),
  },
  multi: { minHeight: rs(84) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8), alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: rp(5), height: rs(40), paddingHorizontal: rp(14), borderRadius: 999, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface },
  chipOn: { borderColor: T.primary, backgroundColor: T.primaryDim },
  chipText: { fontFamily: 'DMSans-SemiBold', fontSize: rf(14), color: T.text },
  chipTextOn: { color: T.primary },
  priceInput: { width: rs(80), height: rs(40), paddingVertical: 0, textAlign: 'center' },
  hint: { fontFamily: 'DMSans-Regular', fontSize: rf(12), color: T.textSecondary },
  submit: { marginTop: rp(20), height: rs(52), borderRadius: 999, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  submitText: { fontFamily: 'DMSans-Bold', fontSize: rf(16), color: '#fff' },
});
