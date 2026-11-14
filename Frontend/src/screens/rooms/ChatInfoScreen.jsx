/** Contact info for a Room chat (tap the chat header): who they are to you, call buttons,
 * media / links / voice, who's inside the Room, mute, pin, archive, their Room's welcome media,
 * and the safety actions. Params: { connectionId }. */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Image, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Archive, ArrowLeft, BellOff, ChevronRight, DoorOpen, Eraser, Flag, Images, Phone, Pin,
  ShieldOff, Video, Play,
} from 'lucide-react-native';
import { rs, rf, rp, FONT, SPACING, HIT_SLOP } from '../../utils/responsive';
import T from '../../utils/theme';
import { API_BASE_URL } from '../../config/api';
import { useToast } from '../../components/ui/Toast';
import { Avatar } from '../../components/rooms/ChatBits';
import { chatsApi } from '../../services/chats';
import { callsApi, callParams } from '../../services/calls';
import { confirmBlock, confirmClear, confirmRemove, confirmReport, mutedLabel, pickMute } from '../../services/roomActions';
import { intentLabel } from '../../config/linkup';

function poster(url) { return url ? url.replace(/\.\w+(\?.*)?$/, '.jpg$1') : url; }

function Row({ icon: Icon, label, value, onPress, danger, right }) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <Icon size={rs(20)} color={danger ? T.danger : T.textSecondary} />
      <Text style={[s.rowLabel, danger && { color: T.danger }]}>{label}</Text>
      {value ? <Text style={s.rowValue}>{value}</Text> : null}
      {right}
    </TouchableOpacity>
  );
}

export default function ChatInfoScreen({ route, navigation }) {
  const { connectionId } = route.params;
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [media, setMedia] = useState(null);
  const [guests, setGuests] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/drops/connections/${connectionId}/messages`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setData(d);
      setMedia(await chatsApi.media(connectionId, 'media'));
      // Who's inside the Room (a nice-to-have; quiet if it fails).
      const host = d.connection?.host_user_id;
      if (host) {
        fetch(`${API_BASE_URL}/api/v1/drops/room/${host}/guests`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => (r.ok ? r.json() : null)).then((g) => g && setGuests(g.guests || [])).catch(() => {});
      }
    } catch {
      showToast({ type: 'error', message: "Couldn't load this chat." });
    }
  }, [connectionId, showToast]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const ok = (msg) => showToast({ type: 'success', message: msg });
  const fail = (msg) => showToast({ type: 'error', message: msg || 'Something went wrong.' });
  const leave = (msg) => { ok(msg); navigation.popToTop(); };

  if (!data) return <SafeAreaView style={[s.safe, s.center]}><ActivityIndicator color={T.primary} /></SafeAreaView>;
  const c = data.connection;
  const prof = data.chat_profile || {};
  const name = c.other_anonymous_name || 'Anonymous';
  const avatar = c.other_avatar_url || (!c.is_sender ? prof.profile_picture_url : null);
  const since = c.inside_since ? new Date(c.inside_since).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const total = media ? media.counts.media + media.counts.voice + media.counts.links : 0;

  const setPref = async (body) => {
    try {
      const p = await chatsApi.prefs(connectionId, body);
      setData((d) => ({ ...d, connection: { ...d.connection, ...p } }));
    } catch (e) { fail(e.message); }
  };

  const call = async (video) => {
    if (busy) return;
    setBusy(true);
    try {
      const d = await callsApi.direct(connectionId, video);
      navigation.navigate('DropCall', callParams(d, { other: { name, avatar_url: avatar, ...(d.other || {}) } }));
    } catch (e) {
      showToast({ type: e.status === 409 || e.status === 403 ? 'info' : 'error', message: e.message });
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.top}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} accessibilityLabel="Back"><ArrowLeft size={rs(22)} color={T.text} /></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: rp(40) }}>
        <View style={s.hero}>
          <Avatar name={name} url={avatar} seed={c.other_user_id} size={rs(112)} online={c.other_is_online} />
          <Text style={s.name}>{name}</Text>
          <Text style={s.role}>
            {c.is_sender ? `Your guest${since ? ` · let in ${since}` : ''}` : `You're inside their Room${since ? ` · since ${since}` : ''}`}
          </Text>
          <Text style={s.presence}>{c.other_is_online ? 'online' : 'offline'}</Text>
          <View style={s.actions}>
            {[[Phone, 'Voice', () => call(false)], [Video, 'Video', () => call(true)], [DoorOpen, 'Room', () => navigation.navigate('Room', { userId: c.other_user_id })]].map(([Icon, label, fn]) => (
              <TouchableOpacity key={label} style={s.action} onPress={fn} disabled={busy} accessibilityRole="button" accessibilityLabel={label}>
                <Icon size={rs(21)} color={T.primary} />
                <Text style={s.actionText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {c.knock_pitch || c.knock_intents?.length ? (
          <View style={s.card}>
            <Text style={s.cardKicker}>{c.is_sender ? 'THEIR KNOCK' : 'YOUR KNOCK'}</Text>
            {c.knock_pitch ? <Text style={s.cardText}>“{c.knock_pitch}”</Text> : null}
            {c.knock_intents?.length ? <Text style={s.cardMeta}>{c.knock_intents.map(intentLabel).join(' · ')}</Text> : null}
          </View>
        ) : null}

        <View style={s.card}>
          <TouchableOpacity style={s.mediaHead} onPress={() => navigation.navigate('ChatMedia', { connectionId, name })} activeOpacity={0.7}>
            <Text style={s.cardTitle}>Media, links and voice</Text>
            <Text style={s.rowValue}>{total}</Text>
            <ChevronRight size={rs(18)} color={T.textMuted} />
          </TouchableOpacity>
          {media?.items?.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: rp(8) }}>
              {media.items.slice(0, 8).map((m) => (
                <TouchableOpacity key={m.id} onPress={() => navigation.navigate('ChatMedia', { connectionId, name })}>
                  <Image source={{ uri: m.media_type === 'video' ? poster(m.media_url) : m.media_url }} style={s.thumb} />
                  {m.media_type === 'video' ? <View style={s.thumbPlay}><Play size={rs(14)} color="#fff" fill="#fff" /></View> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : <Text style={s.cardMeta}>Shared photos and videos land here.</Text>}
        </View>

        {!c.is_sender && prof.gallery?.length ? (
          <View style={s.card}>
            <Text style={[s.cardTitle, { marginBottom: rp(10) }]}>Their welcome media</Text>
            <View style={{ flexDirection: 'row', gap: rp(8) }}>
              {prof.gallery.slice(0, 3).map((g, i) => (
                <Image key={i} source={{ uri: g.media_type === 'video' ? poster(g.media_url) : g.media_url }} style={[s.thumb, { flex: 1, height: rs(120) }]} />
              ))}
            </View>
          </View>
        ) : null}

        {guests?.length ? (
          <View style={s.card}>
            <Text style={[s.cardTitle, { marginBottom: rp(6) }]}>{c.is_sender ? 'Inside your Room' : `Inside ${name}'s Room`}</Text>
            {guests.slice(0, 12).map((g) => (
              <View key={g.user_id} style={s.guest}>
                <View style={[s.guestDot, g.is_online && { backgroundColor: T.online }]} />
                <Text style={s.guestName} numberOfLines={1}>{g.anonymous_name}</Text>
                <Text style={s.rowValue}>{g.is_online ? 'online' : 'offline'}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={s.group}>
          <Row icon={BellOff} label="Mute notifications" value={mutedLabel(c.muted_until)} onPress={() => pickMute(connectionId, c.muted_until, (p) => setData((d) => ({ ...d, connection: { ...d.connection, ...p } })), fail)} />
          <Row icon={Pin} label="Pin chat" right={<Switch value={!!c.pinned} onValueChange={(v) => setPref({ pinned: v })} trackColor={{ true: T.primary, false: T.border }} thumbColor="#fff" />} />
          <Row icon={Archive} label="Archive chat" right={<Switch value={!!c.archived} onValueChange={(v) => setPref({ archived: v })} trackColor={{ true: T.primary, false: T.border }} thumbColor="#fff" />} />
          <Row icon={Images} label={c.is_sender ? 'Your Room settings' : 'Visit their Room'} onPress={() => (c.is_sender ? navigation.navigate('ChatProfileSetup') : navigation.navigate('Room', { userId: c.other_user_id }))} right={<ChevronRight size={rs(18)} color={T.textMuted} />} />
        </View>

        <View style={s.group}>
          <Row icon={Eraser} label="Clear chat" danger onPress={() => confirmClear(connectionId, (m) => { ok(m); load(); }, fail)} />
          {c.is_sender ? (
            <Row icon={ShieldOff} label={`Remove ${name} from your Room`} danger onPress={() => confirmRemove(c, leave, fail, () => confirmBlock(c.other_user_id, leave, fail))} />
          ) : null}
          <Row icon={ShieldOff} label={`Block ${name}`} danger onPress={() => confirmBlock(c.other_user_id, leave, fail)} />
          <Row icon={Flag} label={`Report ${name}`} danger onPress={() => confirmReport(c.other_user_id, ok, fail)} />
        </View>
        <Text style={s.foot}>Your real name, number and location stay hidden.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  center: { alignItems: 'center', justifyContent: 'center' },
  top: { height: rs(52), justifyContent: 'center', paddingHorizontal: SPACING.md },
  hero: { alignItems: 'center', paddingHorizontal: SPACING.md, paddingBottom: rp(18) },
  name: { fontSize: rf(24), fontFamily: 'DMSans-Bold', color: T.text, marginTop: rp(14) },
  role: { fontSize: FONT.sm, color: T.textSecondary, marginTop: rp(4), textAlign: 'center' },
  presence: { fontSize: rf(12), color: T.textMuted, marginTop: rp(2) },
  actions: { flexDirection: 'row', gap: rp(10), marginTop: rp(18) },
  action: { width: rs(92), height: rs(68), borderRadius: rs(14), borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center', gap: rp(6) },
  actionText: { fontSize: rf(12.5), color: T.text, fontFamily: 'DMSans-SemiBold' },
  card: { marginHorizontal: SPACING.md, marginTop: rp(10), padding: SPACING.md, borderRadius: rs(16), backgroundColor: T.surface },
  cardKicker: { fontSize: rf(10.5), letterSpacing: 1, color: T.primary, fontFamily: 'DMSans-Bold', marginBottom: rp(6) },
  cardTitle: { flex: 1, fontSize: FONT.md, fontFamily: 'DMSans-SemiBold', color: T.text },
  cardText: { fontSize: FONT.sm, color: T.text, fontStyle: 'italic', lineHeight: FONT.sm * 1.5 },
  cardMeta: { fontSize: rf(12.5), color: T.textSecondary, marginTop: rp(6) },
  mediaHead: { flexDirection: 'row', alignItems: 'center', gap: rp(6), marginBottom: rp(10) },
  thumb: { width: rs(76), height: rs(76), borderRadius: rs(10), backgroundColor: T.surfaceAlt },
  thumbPlay: { position: 'absolute', left: rp(6), bottom: rp(6) },
  group: { marginHorizontal: SPACING.md, marginTop: rp(10), borderRadius: rs(16), backgroundColor: T.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: rp(16), paddingHorizontal: SPACING.md, minHeight: rs(54) },
  rowLabel: { flex: 1, fontSize: FONT.md, color: T.text },
  rowValue: { fontSize: rf(13), color: T.textSecondary },
  guest: { flexDirection: 'row', alignItems: 'center', gap: rp(10), paddingVertical: rp(7) },
  guestDot: { width: rs(7), height: rs(7), borderRadius: rs(4), backgroundColor: T.border },
  guestName: { flex: 1, fontSize: FONT.sm, color: T.text },
  foot: { fontSize: rf(11.5), color: T.textMuted, textAlign: 'center', paddingHorizontal: SPACING.xl, marginTop: rp(18) },
});
