/** "Your Room" studio, and where every Room setting lives (the Rooms tab's ⋮ menu opens it on
 * a tab). Tabs: My Room, Welcome, Knocks, Inside, Calls, Appearance, Privacy, Notifications.
 * Accepts { tab }. */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Image, ActivityIndicator, TextInput, Switch, Alert, KeyboardAvoidingView,
} from 'react-native';
import { useSelector } from 'react-redux';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera, Video, ChevronLeft, ChevronRight, Phone, Coins,
} from 'lucide-react-native';

import { T } from '../../utils/colorTokens';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP, BUTTON_HEIGHT } from '../../utils/responsive';
import DropScreenHeader from '../../components/drops/DropScreenHeader';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { uploadViaBackend } from '../../utils/upload';
import { CHAT_FONT_OPTIONS, DEFAULT_CHAT_FONT } from '../../config/fonts';
import { intentLabel } from '../../config/linkup';
import {
  DEFAULT_ROOM_THEME, roomThemeById,
} from '../../config/roomThemes';
import RoomThemePicker, { RoomMini } from '../../components/rooms/RoomThemePicker';
import KnockClues from '../../components/rooms/KnockClues';

// What a Knock on this Room must carry (Backend chat_profile.py DOOR_RULES).
const DOOR_RULES = [
  { id: 'line_peek', label: 'A line + a peek', hint: 'A line plus a photo, video or voice note.' },
  { id: 'line', label: 'A line is enough', hint: 'Just a line about themselves. Fewer clues, more knocks.' },
  { id: 'voice', label: 'A voice note', hint: '5 to 15 seconds of their voice. A strong clue without a face.' },
];

// Where the Room shows in Discover (Backend chat_profile.py LISTINGS). Default "limited".
const LISTINGS = [
  { id: 'discoverable', label: 'Show my Room in Near', hint: 'People nearby can find your Room, even with no post up.' },
  { id: 'limited', label: 'Only through my posts', hint: "Only reachable from your posts." },
  { id: 'private', label: 'Keep me out of Near', hint: "Your posts still show in the feed, but you won't appear in Near." },
];

const TABS = [
  ['room', 'My Room'], ['knocks', 'Knocks'], ['inside', 'Inside'], ['calls', 'Calls'],
  ['appearance', 'Appearance'], ['privacy', 'Privacy'], ['notifications', 'Notifications'],
];
const NOTIFY_ROWS = [
  ['knocks', 'New knocks', 'Someone knocks on your Room'],
  ['messages', 'Messages', 'New messages in your conversations'],
  ['calls', 'Calls', 'Incoming and missed calls'],
  ['previews', 'Show message text', 'Off: notifications say "New message" without the words'],
];
const hourLabel = (h) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' });
const shortDate = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const REPORT_REASONS = [
  ['abuse', 'Harassment or abuse'], ['explicit', 'Sexually explicit or unwanted'], ['doxxing', 'Shares private info'],
  ['spam', 'Spam or scam'], ['other', 'Something else'],
];

function extOf(uri) {
  return uri.split('?')[0].split('.').pop()?.toLowerCase() || '';
}

export default function ChatProfileSetupScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const me = useSelector((state) => state.auth.user?.id);
  const [tab, setTab] = useState(TABS.some(([k]) => k === route?.params?.tab) ? route.params.tab : 'room');

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);

  const [fontStyle, setFontStyle]             = useState(DEFAULT_CHAT_FONT);
  const [profilePictureUrl, setProfilePictureUrl] = useState(null);
  const [anonymousName, setAnonymousName]     = useState('');
  const [roomTheme, setRoomTheme]             = useState(DEFAULT_ROOM_THEME);
  const [knocksOpen, setKnocksOpen]           = useState(true);
  // A break's length, picked when knocks go off this visit (null = keep what the server has).
  const [breakHours, setBreakHours]           = useState(null);
  const [breakUntil, setBreakUntil]           = useState(null);
  const [doorRule, setDoorRule]               = useState('line_peek');
  const [listing, setListing]                 = useState('limited');
  const [knocks, setKnocks]                   = useState(null);
  const [inside, setInside]                   = useState(null);
  const [personBusy, setPersonBusy]           = useState(null);
  const [allowAudioCalls, setAllowAudioCalls] = useState(true);
  const [allowVideoCalls, setAllowVideoCalls] = useState(true);
  const [notify, setNotify]                   = useState(null);
  const [history, setHistory]                 = useState([]);

  const authHeaders = useCallback(async (json = false) => {
    const token = await AsyncStorage.getItem('token');
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/chat-profile/me`, {
          headers: await authHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setFontStyle(data.font_style || DEFAULT_CHAT_FONT);
            setProfilePictureUrl(data.profile_picture_url || null);
            setAnonymousName(data.anonymous_name || '');
            setRoomTheme(data.room_theme || DEFAULT_ROOM_THEME);
            setKnocksOpen(data.knocks_open !== false);
            setBreakUntil(data.break_until || null);
            setBreakHours(null);
            setDoorRule(data.door_rule || 'line_peek');
            setListing(data.listing || 'limited');
            setAllowAudioCalls(data.allow_audio_calls !== false);
            setAllowVideoCalls(data.allow_video_calls !== false);
            setNotify(data.notify || { knocks: true, messages: true, calls: true, sessions: true, previews: true, quiet_start: null, quiet_end: null });
          }
        }
      } catch {
        /* offline — start fresh, save will retry */
      } finally {
        setLoading(false);
      }
    })();
  }, [authHeaders]);

  const handlePickProfilePicture = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'warning', message: 'Gallery access is needed.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      legacy: true,   // Android: pick straight from Gallery / Files, not the Google Photos picker
      mediaTypes: 'images', quality: 0.85, allowsEditing: true, aspect: [1, 1],
    });
    if (result.canceled) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const ext = extOf(asset.uri) || 'jpg';
      const mimeType = ext === 'gif' ? 'image/gif' : 'image/jpeg';
      const url = await uploadViaBackend(asset.uri, 'image', mimeType);
      setProfilePictureUrl(url);
    } catch (e) {
      showToast({ type: 'error', message: e?.message || 'Could not upload picture. Check your connection.' });
    } finally {
      setUploading(false);
    }
  }, [authHeaders, showToast]);


  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/chat-profile/me`, {
        method: 'PUT',
        headers: await authHeaders(true),
        body: JSON.stringify({
          font_style: fontStyle,
          profile_picture_url: profilePictureUrl,
          knocks_open: knocksOpen,
          ...(!knocksOpen && breakHours !== null ? { break_hours: breakHours } : {}),
          door_rule: doorRule,
          listing,
          allow_audio_calls: allowAudioCalls,
          allow_video_calls: allowVideoCalls,
          ...(notify ? {
            notify: {
              knocks: notify.knocks, messages: notify.messages, calls: notify.calls, sessions: notify.sessions,
              previews: notify.previews,
              ...(notify.quiet_start != null && notify.quiet_end != null
                ? { quiet_start: notify.quiet_start, quiet_end: notify.quiet_end }
                : { quiet_start: -1, quiet_end: -1 }),
              tz_offset_min: -new Date().getTimezoneOffset(),
            },
          } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not save. Try again.');
      showToast({ type: 'success', message: 'Saved. Your Room is ready for visitors.' });
    } catch (e) {
      showToast({ type: 'error', message: e?.message || 'Could not save. Try again.' });
    } finally {
      setSaving(false);
    }
  }, [fontStyle, profilePictureUrl,
      knocksOpen, breakHours, doorRule, listing,
      allowAudioCalls, allowVideoCalls, notify, authHeaders, showToast]);

  // Applies straight away (the picker has its own Apply / Cancel).
  const handleApplyTheme = useCallback(async (id) => {
    const res = await fetch(`${API_BASE_URL}/api/v1/chat-profile/me`, {
      method: 'PUT', headers: await authHeaders(true), body: JSON.stringify({ room_theme: id }),
    });
    if (!res.ok) { showToast({ type: 'error', message: 'Could not save the theme. Try again.' }); return; }
    setRoomTheme(id);
    showToast({ type: 'success', message: `${roomThemeById(id).name} applied. Visitors see it now.` });
  }, [authHeaders, showToast]);

  const loadPeople = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const [k, c, v] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/unlock-requests/incoming`, { headers }).then((r) => r.json()),
        fetch(`${API_BASE_URL}/api/v1/drops/connections`, { headers }).then((r) => r.json()),
        fetch(`${API_BASE_URL}/api/v1/drops/room/visitors`, { headers }).then((r) => r.json()).catch(() => ({})),
      ]);
      setKnocks(k.requests || []);
      setHistory((v.visitors || []).filter((x) => x.status !== 'inside'));
      // One row per person inside, their latest thread first.
      const seen = new Set();
      setInside((c.connections || []).filter((x) => x.is_sender && !seen.has(x.other_user_id) && seen.add(x.other_user_id)));
    } catch {
      setKnocks((v) => v || []);
      setInside((v) => v || []);
    }
  }, [authHeaders]);
  useEffect(() => { loadPeople(); }, [loadPeople]);

  const post = useCallback(async (path, body) => {
    const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
      method: 'POST', headers: await authHeaders(!!body), ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : data.detail?.message || 'Something went wrong.');
    return data;
  }, [authHeaders]);

  const handleKnock = useCallback(async (k, letIn) => {
    setPersonBusy(k.id);
    try {
      if (letIn) {
        const d = await post(`/unlock-requests/${k.id}/accept`);
        showToast({ type: 'success', message: `${k.requester_anonymous_name || 'They'} are inside now.` });
        if (d.connection_id) navigation.navigate('DropChat', { connectionId: d.connection_id });
      } else {
        await post(`/unlock-requests/${k.id}/decline`);
        showToast({ type: 'info', message: "Declined. They weren't charged." });
      }
      await loadPeople();
    } catch (e) {
      showToast({ type: 'warning', message: e.message });
    } finally {
      setPersonBusy(null);
    }
  }, [post, loadPeople, navigation, showToast]);

  const handleBlock = useCallback((c) => {
    Alert.alert(`Block ${c.other_anonymous_name}?`, "They're removed from your Room and can't knock again.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: async () => {
        setPersonBusy(c.id);
        try {
          // Blocking closes the conversation and any call straight away, server side.
          await post(`/users/${c.other_user_id}/block`);
          showToast({ type: 'info', message: "Blocked. They can't see your Room or knock again." });
          await loadPeople();
        } catch (e) { showToast({ type: 'error', message: e.message }); } finally { setPersonBusy(null); }
      } },
    ]);
  }, [post, loadPeople, showToast]);

  const handleRemove = useCallback((c) => {
    if (c.removable_at && new Date(c.removable_at) > new Date()) {
      Alert.alert('Not yet', `You can remove them from ${shortDate(c.removable_at)}. Something wrong? Block them now.`, [
        { text: 'OK', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: () => handleBlock(c) },
      ]);
      return;
    }
    Alert.alert(`Remove ${c.other_anonymous_name}?`, "The chat closes. They're outside again.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        setPersonBusy(c.id);
        try {
          await post(`/drops/connections/${c.id}/remove`);
          showToast({ type: 'info', message: `${c.other_anonymous_name} is out of your Room.` });
          await loadPeople();
        } catch (e) { showToast({ type: 'error', message: e.message }); } finally { setPersonBusy(null); }
      } },
    ]);
  }, [post, loadPeople, showToast, handleBlock]);

  const handleReport = useCallback((c) => {
    Alert.alert(`Report ${c.other_anonymous_name}`, 'What happened?', [
      ...REPORT_REASONS.map(([k, label]) => ({ text: label, onPress: async () => {
        try {
          await post(`/users/${c.other_user_id}/report`, { reason: k });
          showToast({ type: 'success', message: 'Report received. Thank you.' });
        } catch (e) { showToast({ type: 'error', message: e.message }); }
      } })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [post, showToast]);


  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]} edges={['top', 'left', 'right']}>
        <ActivityIndicator color={T.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <DropScreenHeader title="Your Room" navigation={navigation} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsIn}>
        {TABS.map(([k, label]) => (
          <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabOn]} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>{label}</Text>
            {k === 'knocks' && knocks?.length ? <View style={styles.badge}><Text style={styles.badgeText}>{knocks.length}</Text></View> : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + rp(100) }]}>
        {tab === 'room' && (
          <>
        <View style={styles.heroCard}>
          <RoomMini theme={roomTheme} name={anonymousName} big />
          <View style={{ flex: 1, gap: rp(6) }}>
            <Text style={styles.heroTitle}>{roomThemeById(roomTheme).room}</Text>
            <Text style={styles.heroText}>Your private space. They peek, they knock, you decide.</Text>
            {me ? (
              <TouchableOpacity style={styles.pill} onPress={() => navigation.navigate('Room', { userId: me })}>
                <Text style={styles.pillText}>See it as a visitor</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Room picture: your account photo by default, or set one just for the Room. */}
        <Text style={styles.sectionLabel}>Profile picture</Text>
        <TouchableOpacity onPress={handlePickProfilePicture} activeOpacity={0.85} style={styles.avatarWrap}>
          {profilePictureUrl ? (
            <Image source={{ uri: profilePictureUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitialText}>
                {anonymousName?.[0]?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            <Camera size={rs(12)} color="#fff" />
          </View>
        </TouchableOpacity>
        <Text style={styles.avatarHint}>Tap to change</Text>

          </>
        )}

        {tab === 'appearance' && (
          <>
        <Text style={styles.sectionLabel}>Room theme</Text>
        <RoomThemePicker saved={roomTheme} name={anonymousName} onApply={handleApplyTheme} />


        {/* Font */}
        <Text style={styles.sectionLabel}>Name font</Text>
        <View style={styles.chipRow}>
          {CHAT_FONT_OPTIONS.map((f) => (
            <TouchableOpacity
              key={f.id}
              onPress={() => setFontStyle(f.id)}
              style={[styles.fontChip, fontStyle === f.id && styles.chipActive]}
              hitSlop={HIT_SLOP}
            >
              <Text style={[styles.fontChipPreview, { fontFamily: f.fontFamily }, fontStyle === f.id && styles.chipTextActive]}>Aa</Text>
              <Text style={[styles.chipText, fontStyle === f.id && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

          </>
        )}


        {tab === 'calls' && (
          <>
        <Text style={styles.sectionLabel}>Who can call you</Text>
        <View style={styles.option}>
          <Phone size={rs(16)} color={T.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>Voice calls</Text>
            <Text style={styles.optionHint}>People inside can ring you from the chat.</Text>
          </View>
          <Switch value={allowAudioCalls} onValueChange={setAllowAudioCalls} trackColor={{ false: T.surfaceAlt, true: T.gold }} thumbColor="#fff" accessibilityLabel="Allow voice calls" />
        </View>
        <View style={styles.option}>
          <Video size={rs(16)} color={T.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>Video calls</Text>
            <Text style={styles.optionHint}>Off: they'll message instead.</Text>
          </View>
          <Switch value={allowVideoCalls} onValueChange={setAllowVideoCalls} trackColor={{ false: T.surfaceAlt, true: T.gold }} thumbColor="#fff" accessibilityLabel="Allow video calls" />
        </View>

          </>
        )}

        {tab === 'knocks' && (
          knocks === null ? <ActivityIndicator color={T.primary} style={{ marginTop: rp(30) }} /> : (
            <>
              <Text style={styles.info}>Knocking is free. Let them in and the fee leaves their wallet, once. Decline and nothing moves. You never pay to let someone in.</Text>
              <TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate('Coins')}>
                <Coins size={rs(14)} color={T.gold} />
                <Text style={styles.linkText}>Your wallet and coin history</Text>
              </TouchableOpacity>
              {knocks.length === 0 ? <Text style={styles.empty}>No one's at the door. Post something and watch the knocks come in.</Text> : null}
              {knocks.map((k) => (
                <View key={k.id} style={styles.person}>
                  <View style={styles.personAva}>
                    {k.requester_avatar_url ? <Image source={{ uri: k.requester_avatar_url }} style={styles.personImg} /> : <Text style={styles.personInitial}>{(k.requester_anonymous_name || 'A')[0].toUpperCase()}</Text>}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.personName} numberOfLines={1}>{k.requester_anonymous_name || 'Anonymous'}</Text>
                    <Text style={styles.personSub} numberOfLines={2}>
                      {k.pitch ? `“${k.pitch}”` : 'Just knocked'}{k.intents?.length ? ` · ${k.intents.map(intentLabel).join(', ')}` : ''}
                    </Text>
                    {/* Videos open full size in the Knocks inbox. */}
                    <KnockClues item={k} onOpenMedia={() => navigation.navigate('UnlockRequestsScreen')} />
                    <View style={styles.personActs}>
                      <TouchableOpacity style={styles.actBtn} onPress={() => navigation.navigate('Room', { userId: k.requester_id })}><Text style={styles.actText}>Peek</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.actBtn} disabled={personBusy === k.id} onPress={() => handleKnock(k, false)}><Text style={styles.actText}>Decline</Text></TouchableOpacity>
                      <TouchableOpacity style={[styles.actBtn, styles.actPrimary]} disabled={personBusy === k.id} onPress={() => handleKnock(k, true)}>
                        {personBusy === k.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.actText, { color: '#fff' }]}>Let In</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )
        )}

        {tab === 'inside' && (
          inside === null ? <ActivityIndicator color={T.primary} style={{ marginTop: rp(30) }} /> : (
            <>
              <Text style={styles.info}>People you've let in. Remove after 3 days, block any time.</Text>
              {inside.length === 0 ? <Text style={styles.empty}>Nobody's inside yet.</Text> : null}
              {inside.map((c) => (
                <View key={c.id} style={styles.person}>
                  <View style={styles.personAva}>
                    {c.other_avatar_url ? <Image source={{ uri: c.other_avatar_url }} style={styles.personImg} /> : <Text style={styles.personInitial}>{(c.other_anonymous_name || 'A')[0].toUpperCase()}</Text>}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.personName} numberOfLines={1}>{c.other_anonymous_name || 'Anonymous'}</Text>
                    <Text style={styles.personSub} numberOfLines={1}>{c.last_message || 'No messages yet'}</Text>
                    <View style={styles.personActs}>
                      <TouchableOpacity style={styles.actBtn} onPress={() => navigation.navigate('DropChat', { connectionId: c.id })}><Text style={styles.actText}>Chat</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.actBtn} disabled={personBusy === c.id} onPress={() => handleRemove(c)}>
                        <Text style={[styles.actText, c.removable_at && new Date(c.removable_at) > new Date() && { color: T.textMute }]}>
                          {c.removable_at && new Date(c.removable_at) > new Date() ? `Remove from ${new Date(c.removable_at).toLocaleDateString([], { weekday: 'short' })}` : 'Remove'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actBtn} onPress={() => handleReport(c)}><Text style={styles.actText}>Report</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.actBtn} disabled={personBusy === c.id} onPress={() => handleBlock(c)}><Text style={[styles.actText, { color: T.danger }]}>Block</Text></TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
              {history.length ? <Text style={styles.sectionLabel}>History</Text> : null}
              {history.map((h) => (
                <View key={h.user_id} style={[styles.person, { opacity: 0.85 }]}>
                  <View style={styles.personAva}>
                    {h.avatar_url ? <Image source={{ uri: h.avatar_url }} style={styles.personImg} /> : <Text style={styles.personInitial}>{(h.anonymous_name || 'A')[0].toUpperCase()}</Text>}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.personName} numberOfLines={1}>{h.anonymous_name}</Text>
                    <Text style={styles.personSub} numberOfLines={1}>
                      {h.status === 'blocked' ? 'Blocked' : 'Removed'} · let in {new Date(h.let_in_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  {h.status === 'blocked' ? (
                    <TouchableOpacity style={styles.actBtn} onPress={() => navigation.navigate('BlockList')}><Text style={styles.actText}>Manage</Text></TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </>
          )
        )}

        {tab === 'notifications' && notify && (
          <>
            <Text style={styles.sectionLabel}>Room notifications</Text>
            {NOTIFY_ROWS.map(([key, title, hint]) => (
              <View key={key} style={styles.option}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{title}</Text>
                  <Text style={styles.optionHint}>{hint}</Text>
                </View>
                <Switch
                  value={notify[key] !== false}
                  onValueChange={(v) => setNotify((n) => ({ ...n, [key]: v }))}
                  trackColor={{ false: T.surfaceAlt, true: T.gold }}
                  thumbColor="#fff"
                  accessibilityLabel={title}
                />
              </View>
            ))}
            <Text style={styles.sectionLabel}>Quiet hours</Text>
            <View style={styles.option}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>Hold notifications overnight</Text>
                <Text style={styles.optionHint}>
                  {notify.quiet_start != null
                    ? `Nothing buzzes from ${hourLabel(notify.quiet_start)} to ${hourLabel(notify.quiet_end)}. Everything waits in your Room.`
                    : 'Everything still arrives, silently.'}
                </Text>
              </View>
              <Switch
                value={notify.quiet_start != null}
                onValueChange={(v) => setNotify((n) => ({ ...n, quiet_start: v ? 23 : null, quiet_end: v ? 7 : null }))}
                trackColor={{ false: T.surfaceAlt, true: T.gold }}
                thumbColor="#fff"
                accessibilityLabel="Quiet hours"
              />
            </View>
            {notify.quiet_start != null && [['quiet_start', 'From'], ['quiet_end', 'Until']].map(([k, label]) => (
              <View key={k} style={styles.stepper}>
                <Text style={styles.optionTitle}>{label}</Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity style={styles.stepBtn} onPress={() => setNotify((n) => ({ ...n, [k]: (n[k] + 23) % 24 }))} accessibilityLabel={`${label} earlier`}>
                  <ChevronLeft size={rs(16)} color={T.text} />
                </TouchableOpacity>
                <Text style={styles.stepValue}>{hourLabel(notify[k])}</Text>
                <TouchableOpacity style={styles.stepBtn} onPress={() => setNotify((n) => ({ ...n, [k]: (n[k] + 1) % 24 }))} accessibilityLabel={`${label} later`}>
                  <ChevronRight size={rs(16)} color={T.text} />
                </TouchableOpacity>
              </View>
            ))}
            <Text style={styles.info}>Turn off "Show message text" to keep words off your lock screen.</Text>
          </>
        )}

        {tab === 'privacy' && (
          <>

            <Text style={styles.sectionLabel}>Your door</Text>
            <View style={styles.option}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>Taking knocks</Text>
                <Text style={styles.optionHint}>
                  {knocksOpen
                    ? 'Anyone 18+ who finds your post can knock.'
                    : breakUntil && breakHours === null
                      ? `On a break until ${new Date(breakUntil).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}. Nobody new can knock.`
                      : 'On a break. Nobody new can knock.'}
                </Text>
              </View>
              <Switch
                value={knocksOpen}
                onValueChange={(v) => { setKnocksOpen(v); setBreakHours(v ? null : 12); }}
                trackColor={{ false: T.surfaceAlt, true: T.gold }}
                thumbColor="#fff"
                accessibilityLabel="Taking knocks"
              />
            </View>
            {!knocksOpen && breakHours !== null && [[12, 'For tonight', 'Back on in 12 hours'], [72, 'For 3 days', 'Back on by itself'], [168, 'For a week', 'Back on by itself'], [0, 'Until I switch it back', 'Stays off']].map(([h, label, hint]) => (
              <TouchableOpacity
                key={h}
                style={[styles.option, breakHours === h && styles.optionOn]}
                onPress={() => setBreakHours(h)}
                accessibilityRole="radio"
                accessibilityState={{ checked: breakHours === h }}
              >
                <View style={[styles.radio, breakHours === h && styles.radioOn]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{label}</Text>
                  <Text style={styles.optionHint}>{hint}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <Text style={styles.info}>Only affects knocks. Nobody sees when you're online.</Text>
            <Text style={styles.sectionLabel}>What a knock must include</Text>
            {DOOR_RULES.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={[styles.option, doorRule === r.id && styles.optionOn]}
                onPress={() => setDoorRule(r.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: doorRule === r.id }}
              >
                <View style={[styles.radio, doorRule === r.id && styles.radioOn]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{r.label}</Text>
                  <Text style={styles.optionHint}>{r.hint}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <Text style={styles.info}>Knock photos and videos stay blurred until you tap.</Text>
            <Text style={styles.sectionLabel}>Where people find your Room</Text>
            {LISTINGS.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={[styles.option, listing === r.id && styles.optionOn]}
                onPress={() => setListing(r.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: listing === r.id }}
              >
                <View style={[styles.radio, listing === r.id && styles.radioOn]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{r.label}</Text>
                  <Text style={styles.optionHint}>{r.hint}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <Text style={styles.info}>
              Near shows your area (county and country), never your exact spot. Open or taking a break is about knocks, not whether you're online. People you block can't see your Room or knock on it.
            </Text>
          </>
        )}
      </ScrollView>

      {['room', 'calls', 'appearance', 'privacy', 'notifications'].includes(tab) && (
      <View style={[styles.footer, { paddingBottom: insets.bottom + rp(12) }]}>
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.88}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save changes</Text>}
        </TouchableOpacity>
      </View>
      )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: 'transparent' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content:  { padding: SPACING.md, gap: rp(4) },

  tabs: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: T.border },
  nextCard: { marginTop: rp(18), padding: rp(14), borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.primaryBorder, backgroundColor: T.primaryTint, gap: rp(4) },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: rp(6), marginBottom: rp(10) },
  linkText: { fontFamily: 'DMSans-Bold', fontSize: rf(13), color: T.gold },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: rp(10), paddingVertical: rp(8) },
  stepBtn: { width: rs(34), height: rs(34), borderRadius: rs(17), borderWidth: 1, borderColor: T.borderStrong, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontFamily: 'DMSans-Bold', fontSize: rf(15), color: T.text, minWidth: rs(64), textAlign: 'center' },
  tabsIn: { paddingHorizontal: SPACING.md, paddingVertical: rp(10), gap: rp(6) },
  tab: { flexDirection: 'row', alignItems: 'center', gap: rp(6), height: rs(34), paddingHorizontal: rp(14), borderRadius: 999, borderWidth: 1, borderColor: T.border },
  tabOn: { borderColor: T.gold, backgroundColor: 'rgba(251,191,36,0.08)' },
  tabText: { fontFamily: 'DMSans-Bold', fontSize: rf(13), color: T.textSec },
  tabTextOn: { color: T.text },
  badge: { minWidth: rs(18), height: rs(18), borderRadius: rs(9), paddingHorizontal: rp(5), backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: rf(11), fontWeight: '800' },

  heroCard: { flexDirection: 'row', alignItems: 'center', gap: rp(14), padding: rp(12), borderRadius: RADIUS.lg, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, marginBottom: rp(4) },
  heroTitle: { fontFamily: 'PlayfairDisplay-Italic', fontSize: rf(19), color: T.text },
  heroText: { fontSize: rf(12), color: T.textSec, lineHeight: rf(17) },
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderColor: T.borderStrong, borderRadius: 999, paddingHorizontal: rp(12), paddingVertical: rp(6) },
  pillText: { color: T.text, fontSize: rf(12), fontWeight: '700' },

  input: {
    backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border, borderRadius: RADIUS.md,
    paddingHorizontal: rp(14), paddingVertical: rp(12), color: T.text, fontSize: FONT.md,
    fontFamily: 'DMSans-Regular', minHeight: rs(56), textAlignVertical: 'top',
  },
  info: { fontSize: FONT.sm, color: T.textSec, lineHeight: FONT.sm * 1.5, backgroundColor: T.surface, borderRadius: RADIUS.md, padding: rp(12), marginVertical: rp(8) },
  empty: { fontSize: FONT.sm, color: T.textSec, textAlign: 'center', marginTop: rp(24) },
  person: { flexDirection: 'row', gap: rp(12), paddingVertical: rp(12), borderBottomWidth: 1, borderBottomColor: T.border },
  personAva: { width: rs(46), height: rs(46), borderRadius: rs(23), overflow: 'hidden', backgroundColor: T.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: T.goldBorder },
  personImg: { width: '100%', height: '100%' },
  personInitial: { color: T.text, fontWeight: '800', fontSize: FONT.md },
  personName: { color: T.text, fontWeight: '700', fontSize: FONT.md },
  personSub: { color: T.textSec, fontSize: rf(12), marginTop: rp(2) },
  personActs: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(6), marginTop: rp(8) },
  actBtn: { height: rs(32), paddingHorizontal: rp(12), borderRadius: rs(10), borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  actPrimary: { backgroundColor: T.primary, borderColor: T.primary },
  actText: { color: T.text, fontSize: rf(12), fontWeight: '700' },
  option: { flexDirection: 'row', alignItems: 'center', gap: rp(12), padding: rp(14), borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border, marginBottom: rp(8) },
  optionOn: { borderColor: T.gold, backgroundColor: 'rgba(251,191,36,0.06)' },
  radio: { width: rs(18), height: rs(18), borderRadius: rs(9), borderWidth: 2, borderColor: T.borderStrong },
  radioOn: { borderColor: T.gold, backgroundColor: T.gold },
  optionTitle: { color: T.text, fontSize: FONT.sm, fontWeight: '700' },
  optionHint: { color: T.textSec, fontSize: rf(12), lineHeight: rf(17), marginTop: rp(2) },
  sectionLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(11),
    color:         T.textSec,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop:     SPACING.md,
    marginBottom:  rp(10),
  },
  sectionHint: {
    fontFamily: 'DMSans-Regular',
    fontSize:   rf(11),
    color:      T.textMute,
    marginBottom: rp(10),
  },

  avatarWrap: { alignSelf: 'flex-start', position: 'relative' },
  avatar: {
    width:  rs(80),
    height: rs(80),
    borderRadius: rs(40),
  },
  avatarPlaceholder: {
    backgroundColor: T.surfaceAlt,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     T.border,
  },
  avatarInitialText: { fontSize: rf(28), fontWeight: '700', color: T.primary },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: rs(24), height: rs(24), borderRadius: rs(12),
    backgroundColor: T.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: T.background,
  },
  avatarHint: {
    fontFamily: 'DMSans-Italic', fontSize: rf(11), color: T.textMute,
    marginTop: rp(6),
  },


  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8) },
  chip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(6),
    paddingHorizontal: rp(14),
    paddingVertical:   rp(9),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
    backgroundColor:   T.surfaceAlt,
  },
  fontChip: {
    alignItems:        'center',
    gap:               rp(4),
    paddingHorizontal: rp(14),
    paddingVertical:   rp(9),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
    backgroundColor:   T.surfaceAlt,
    minWidth:          rs(64),
  },
  fontChipPreview: { fontSize: rf(18), color: T.text },
  chipActive: { backgroundColor: T.primaryDim, borderColor: T.primaryBorder },
  chipText:   { fontFamily: 'DMSans-Regular', fontSize: FONT.sm, color: T.textSec },
  chipTextActive: { color: T.primary, fontFamily: 'DMSans-Bold' },



  footer: {
    paddingHorizontal: SPACING.md,
    paddingTop: rp(12),
    borderTopWidth: 1,
    borderTopColor: T.border,
    backgroundColor: T.background,
  },
  saveBtn: {
    height: BUTTON_HEIGHT,
    borderRadius: RADIUS.md,
    backgroundColor: T.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontFamily: 'DMSans-Bold',
    fontSize: FONT.md,
    color: '#fff',
    letterSpacing: 0.4,
  },
});
