/** Link up: sends the author a request. Coins move only if they accept. */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch, useSelector } from 'react-redux';
import { Flame, Camera, Video as VideoIcon, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { T } from '../../utils/colorTokens';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP, BUTTON_HEIGHT } from '../../utils/responsive';
import DropScreenHeader from '../../components/drops/DropScreenHeader';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { fetchBalance } from '../../store/slices/coinsSlice';
import { uploadToR2 } from '../../utils/upload';
import VoiceNoteRecorder from '../../components/common/VoiceNoteRecorder';

const MAX_PEEK = 3;
const MIN_PITCH = 3;
const VOICE_MIN = 2;
const VOICE_MAX = 15;
import { INTENTS, MAX_INTENTS, MAX_PITCH } from '../../config/linkup';
import AgeGate from '../../components/drops/AgeGate';
import useDraft from '../../hooks/useDraft';

// Must match COINS_UNLOCK_COST in Backend/app/api/v1/drops.py
const UNLOCK_COST = 6;
// Must match MAX_REQUEST_VIDEO_SECONDS in Backend/app/api/v1/unlock_requests.py
const MAX_CLUE_VIDEO_SECONDS = 30;

export default function PostUnlockScreen({ route, navigation }) {
  // fromRoom: return to the Room after sending. fromRoom or viaProfile = a profile link up
  // (the only kind a regular confession accepts).
  const { post, linkupTarget, fromRoom, viaProfile } = route.params ?? {};
  const dispatch = useDispatch();
  const { showToast } = useToast();
  const coinBalance = useSelector((state) => state.coins.balance);

  // Either a full post or a light linkupTarget { target_type, target_id, anonymous_name, preview_text }.
  const targetType    = post ? 'drop' : (linkupTarget?.target_type || 'drop');
  const targetId      = post ? post.id : linkupTarget?.target_id;
  const displayName   = post ? post.anonymous_name : linkupTarget?.anonymous_name;
  const displayText   = post ? post.content : linkupTarget?.preview_text;

  const [unlocking, setUnlocking] = useState(false);
  // Long confessions open at 6 lines; "Read all" shows the whole thing.
  const [fullText, setFullText] = useState(false);
  const [clipped, setClipped] = useState(false);
  const [pitch, setPitch, clearPitch] = useDraft(targetId ? `linkup:${targetId}` : null, '');
  const [intents, setIntents] = useState([]);
  const [ageGate, setAgeGate] = useState(false);
  // The host's door rule and the knocker's own Room pieces for a peek (GET /unlock-requests/door).
  const [door, setDoor] = useState(null);
  const [peek, setPeek] = useState([]);
  const [voice, setVoice] = useState(null);   // { url, duration }

  const toggleIntent = useCallback((id) => {
    setIntents((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_INTENTS ? cur : [...cur, id]));
  }, []);

  // Optional clue attached to the request — never required to unlock.
  const [mediaUri,      setMediaUri]      = useState(null);
  const [mediaType,     setMediaType]     = useState(null); // 'image' | 'video'
  const [mediaThumb,    setMediaThumb]    = useState(null); // video poster frame
  const [mediaDuration, setMediaDuration] = useState(0);    // seconds, video only

  // Load the coin balance (it may not be fetched yet).
  useEffect(() => {
    dispatch(fetchBalance());
  }, [dispatch]);

  useEffect(() => {
    if (targetType !== 'drop' || !targetId) return;
    let live = true;
    (async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/api/v1/unlock-requests/door/${targetId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok && live) setDoor(await res.json());
      } catch { /* door stays unknown; the server still enforces it */ }
    })();
    return () => { live = false; };
  }, [targetType, targetId]);

  const rule = door?.door_rule || 'line_peek';
  const hasLine = pitch.trim().length >= MIN_PITCH;
  const voiceOk = !!voice && voice.duration >= VOICE_MIN;
  const hasPeek = peek.length > 0 || !!mediaUri || voiceOk;
  const missing = rule === 'voice' ? (voiceOk ? '' : 'a voice note')
    : rule === 'line_peek' ? [!hasLine && 'a line', !hasPeek && 'a peek'].filter(Boolean).join(' and ')
    : hasLine ? '' : 'a line';
  const togglePeek = useCallback((url) => {
    setPeek((cur) => (cur.includes(url) ? cur.filter((x) => x !== url) : cur.length >= MAX_PEEK ? cur : [...cur, url]));
  }, []);

  const handlePickMedia = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'warning', message: 'Gallery access is needed.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      legacy: true,   // Android: pick straight from Gallery / Files, not the Google Photos picker
      mediaTypes:       ['images', 'videos'],
      quality:          0.85,
      allowsEditing:    false,
      videoMaxDuration: MAX_CLUE_VIDEO_SECONDS,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    const kind  = asset.type === 'video' ? 'video' : 'image';
    const durationSecs = asset.duration ? asset.duration / 1000 : 0;

    if (kind === 'video' && durationSecs > MAX_CLUE_VIDEO_SECONDS) {
      showToast({ type: 'warning', message: `Keep the video under ${MAX_CLUE_VIDEO_SECONDS}s.` });
      return;
    }

    setMediaUri(asset.uri);
    setMediaType(kind);
    setMediaDuration(durationSecs);
    if (kind === 'video') {
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000 });
        setMediaThumb(uri);
      } catch { setMediaThumb(null); }
    } else {
      setMediaThumb(null);
    }
  }, [showToast]);

  const handleClearMedia = useCallback(() => {
    setMediaUri(null);
    setMediaType(null);
    setMediaThumb(null);
    setMediaDuration(0);
  }, []);

  const handleUnlock = useCallback(async () => {
    if (unlocking || !targetId) return;
    setUnlocking(true);
    try {
      const token = await AsyncStorage.getItem('token');

      const body = { target_type: targetType, target_id: targetId, payment_method: 'coins' };
      if (fromRoom || viaProfile) body.via_profile = true;
      if (pitch.trim()) body.pitch = pitch.trim();
      if (intents.length) body.intents = intents;
      if (peek.length) body.peek_urls = peek;
      if (voiceOk) { body.voice_url = voice.url; body.voice_duration = voice.duration; }
      if (mediaUri && mediaType) {
        try {
          const ext = mediaUri.split('?')[0].split('.').pop()?.toLowerCase() || '';
          const mimeType = mediaType === 'video' ? `video/${ext || 'mp4'}` : `image/${ext || 'jpeg'}`;
          body.media_url = await uploadToR2(mediaUri, mediaType, mimeType);
          body.media_type = mediaType;
          if (mediaType === 'video') body.media_duration = mediaDuration;
        } catch {
          showToast({ type: 'error', message: 'Could not upload your clue. Try again.' });
          setUnlocking(false);
          return;
        }
      }

      const res   = await fetch(`${API_BASE_URL}/api/v1/unlock-requests`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      // Already connected: open the chat. Mutual: connects free.
      if (res.ok && (data.already_unlocked || data.mutual) && data.connection_id) {
        if (data.mutual) showToast({ type: 'success', title: "It's mutual 🔥", message: "You both knocked. You're inside." });
        clearPitch();
        navigation.replace('DropChat', { connectionId: data.connection_id });
        return;
      }

      if (res.status === 403 && data?.detail?.code === 'age_verification_required') {
        setAgeGate(true);
        return;
      }

      const requestId = res.ok ? data.request_id : data?.detail?.request_id;
      if (requestId) {
        showToast({
          type: 'success',
          title: 'You knocked.',
          message: `${displayName || 'They'} decides whether to let you in. Nothing's charged unless they do.`,
        });
        dispatch(fetchBalance());
        clearPitch();
        if (fromRoom) navigation.goBack();
        else navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        return;
      }

      if (res.status === 402) {
        showToast({ type: 'warning', message: typeof data.detail === 'string' ? data.detail : 'You need enough coins ready in case they let you in.' });
      } else {
        const message = typeof data.detail === 'string' ? data.detail : data.detail?.message;
        showToast({ type: 'error', message: message ?? 'Could not knock. Try again.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong. Try again.' });
    } finally {
      setUnlocking(false);
    }
  }, [unlocking, targetType, targetId, displayName, pitch, intents, peek, voice, voiceOk, fromRoom, mediaUri, mediaType, mediaDuration, navigation, showToast, dispatch]);

  const canAfford = coinBalance >= UNLOCK_COST;

  return (
    <SafeAreaView style={s.root}>
      <DropScreenHeader title="Knock" navigation={navigation} />

      <ScrollView
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.iconWrap}>
          {post?.avatar_url ? (
            <Image source={{ uri: post.avatar_url }} style={s.avatarImage} />
          ) : (
            <Text style={s.avatarInitial}>
              {displayName?.[0]?.toUpperCase() || 'A'}
            </Text>
          )}
        </View>

        <Text style={s.authorName}>{displayName || 'Anonymous'}</Text>

        {!!displayText && (
          <>
            <Text
              style={[s.confession, clipped && { marginBottom: rp(4) }]}
              numberOfLines={fullText ? undefined : 6}
              onTextLayout={(e) => { if (!fullText && e.nativeEvent.lines.length >= 6) setClipped(true); }}
            >
              &ldquo;{displayText}&rdquo;
            </Text>
            {clipped && (
              <TouchableOpacity onPress={() => setFullText((v) => !v)} hitSlop={HIT_SLOP} style={{ marginBottom: SPACING.lg }}>
                <Text style={s.readAll}>{fullText ? 'Show less' : 'Read all'}</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {ageGate && (
          <View style={{ width: '100%', marginBottom: SPACING.lg }}>
            <AgeGate onDone={() => setAgeGate(false)} />
          </View>
        )}

        {/* Opening line + intent chips — what they read before deciding. */}
        <View style={s.pitchSection}>
          {!!door?.door_copy && <Text style={s.doorCopy}>{door.door_copy}</Text>}
          <Text style={s.pitchLabel}>{rule === 'voice' ? 'A LINE (OPTIONAL)' : 'YOUR LINE'}</Text>
          <TextInput
            value={pitch}
            onChangeText={(v) => setPitch(v.slice(0, MAX_PITCH))}
            placeholder="Make them want to let you in…"
            placeholderTextColor={T.textMute}
            multiline
            maxLength={MAX_PITCH}
            style={s.pitchInput}
          />
          <Text style={s.pitchCount}>{pitch.length}/{MAX_PITCH} · no numbers or handles, save that for inside</Text>
          <View style={s.intentRow}>
            {INTENTS.map((i) => {
              const on = intents.includes(i.id);
              return (
                <TouchableOpacity key={i.id} style={[s.intentChip, on && s.intentChipOn]} onPress={() => toggleIntent(i.id)} activeOpacity={0.8}>
                  <Text style={[s.intentText, on && { color: T.text }]}>{i.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* A peek from their own Room: shown to this host only, blurred until they tap. */}
        {(rule !== 'line' || (door?.my_room?.length ?? 0) > 0) && (
          <View style={s.peekSection}>
            <Text style={s.pitchLabel}>SHOW A PEEK {rule === 'line_peek' ? '' : '(OPTIONAL)'}</Text>
            {door?.my_room?.length ? (
              <View style={s.peekGrid}>
                {door.my_room.map((g) => {
                  const on = peek.includes(g.media_url);
                  return (
                    <TouchableOpacity key={g.media_url} onPress={() => togglePeek(g.media_url)} activeOpacity={0.85} style={[s.peekTile, on && s.peekTileOn]}>
                      <Image source={{ uri: g.media_url }} style={s.peekImg} />
                      {g.media_type === 'video' && <View style={s.mediaPlayBadge}><VideoIcon size={rs(12)} color="#fff" /></View>}
                      {on && <View style={s.peekCheck}><Text style={s.peekCheckText}>✓</Text></View>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text style={s.mediaHint}>Your Room has no photos yet. Add some from Your Room, or attach one below.</Text>
            )}
            <Text style={s.mediaHint}>Only {displayName || 'they'} sees what you pick, even if your Room is private. It arrives blurred until they tap, and disappears if they say no.</Text>
          </View>
        )}

        {/* Or a photo / clip just for this knock. */}
        <View style={s.mediaSection}>
          {mediaUri ? (
            <View style={s.mediaPreviewWrap}>
              <Image
                source={{ uri: mediaType === 'video' ? (mediaThumb || mediaUri) : mediaUri }}
                style={s.mediaPreview}
              />
              {mediaType === 'video' && (
                <View style={s.mediaPlayBadge}>
                  <VideoIcon size={rs(14)} color="#fff" strokeWidth={2} />
                </View>
              )}
              <TouchableOpacity style={s.mediaRemoveBtn} onPress={handleClearMedia} hitSlop={HIT_SLOP}>
                <X size={rs(14)} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.mediaAddBtn} onPress={handlePickMedia} activeOpacity={0.85} hitSlop={HIT_SLOP}>
              <Camera size={rs(16)} color={T.primary} strokeWidth={2} />
              <Text style={s.mediaAddText}>{rule === 'line_peek' && !peek.length ? 'Or add a photo or short clip' : 'Add a photo or short clip (optional)'}</Text>
            </TouchableOpacity>
          )}
          <Text style={s.mediaHint}>
            A clue of who's asking. Keep it decent, reported clues get accounts restricted.
          </Text>
        </View>

        {/* Voice note: hold to record, 5 to 15 seconds. */}
        <View style={s.voiceSection}>
          <Text style={s.pitchLabel}>{rule === 'voice' ? 'YOUR VOICE NOTE' : 'OR SAY IT (OPTIONAL)'}</Text>
          {voice ? (
            <View style={s.voiceDone}>
              <Text style={s.voiceDoneText}>Voice note · {Math.round(voice.duration)}s ✓</Text>
              <TouchableOpacity onPress={() => setVoice(null)} hitSlop={HIT_SLOP}><X size={rs(16)} color={T.textSecondary} /></TouchableOpacity>
            </View>
          ) : (
            <View style={s.voiceRow}>
              <VoiceNoteRecorder maxSeconds={VOICE_MAX} onSend={(v) => {
                if (v.duration < VOICE_MIN) { showToast({ type: 'warning', message: 'Hold a little longer: at least 5 seconds reads best.' }); return; }
                setVoice({ url: v.url, duration: Math.min(v.duration, VOICE_MAX) });
              }} />
              <Text style={s.mediaHint}>Hold to record, up to 15 seconds.</Text>
            </View>
          )}
        </View>

        <View style={s.priceRow}>
          <Flame size={rs(16)} color={T.primary} />
          <Text style={s.priceText}>{UNLOCK_COST} coins, only if they let you in</Text>
        </View>

        <Text style={s.balanceText}>
          Your balance: {coinBalance} coin{coinBalance === 1 ? '' : 's'}
        </Text>

        {canAfford ? (
          <>
            <TouchableOpacity
              style={s.unlockBtn}
              onPress={handleUnlock}
              disabled={unlocking || !!missing}
              activeOpacity={0.88}
              hitSlop={HIT_SLOP}
            >
              {unlocking
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.unlockBtnText}>Knock</Text>
              }
            </TouchableOpacity>
            {!!missing && <Text style={s.missingText}>This door needs {missing} first.</Text>}
            <Text style={s.chargeNote}>
              Free to knock. If {displayName || 'they'} lets you in, {UNLOCK_COST} coins leave your wallet automatically. Free if they already knocked on yours.
            </Text>
          </>
        ) : (
          <TouchableOpacity
            style={s.topUpBtn}
            onPress={() => navigation.navigate('Coins')}
            activeOpacity={0.88}
            hitSlop={HIT_SLOP}
          >
            <Text style={s.topUpBtnText}>Top up your coins</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} style={s.notNowBtn}>
          <Text style={s.notNowText}>Not now</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.background },
  body: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
  },
  iconWrap: {
    width: rs(56), height: rs(56), borderRadius: rs(28),
    backgroundColor: T.primaryDim, alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.lg, borderWidth: 1, borderColor: 'rgba(255,99,74,0.25)',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: FONT.lg, fontWeight: '700', color: T.primary },
  authorName: { fontSize: FONT.lg, fontWeight: '700', color: T.text, fontFamily: 'PlayfairDisplay-Bold', marginBottom: SPACING.sm },
  confession: {
    fontSize: FONT.md, color: T.textSecondary, textAlign: 'center',
    fontStyle: 'italic', lineHeight: FONT.md * 1.5, marginBottom: SPACING.lg,
  },
  readAll: { fontSize: FONT.sm, fontWeight: '700', color: T.primary, textAlign: 'center' },
  copy: { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', lineHeight: FONT.sm * 1.6, marginBottom: SPACING.lg },

  pitchSection: { width: '100%', marginBottom: SPACING.lg, gap: rp(6) },
  doorCopy: {
    fontSize: FONT.sm, color: T.text, lineHeight: FONT.sm * 1.5, padding: rp(10), borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,99,74,0.10)', borderWidth: 1, borderColor: 'rgba(255,99,74,0.3)', marginBottom: rp(4),
  },
  peekSection: { width: '100%', marginBottom: SPACING.lg, gap: rp(8) },
  peekGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8) },
  peekTile: { width: rs(72), height: rs(72), borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  peekTileOn: { borderColor: T.primary },
  peekImg: { width: '100%', height: '100%' },
  peekCheck: { position: 'absolute', top: rp(4), right: rp(4), width: rs(20), height: rs(20), borderRadius: rs(10), backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  peekCheckText: { color: '#fff', fontSize: rf(12), fontWeight: '800' },
  voiceSection: { width: '100%', marginBottom: SPACING.lg, gap: rp(8) },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: rp(10) },
  voiceDone: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: rp(12), borderRadius: RADIUS.md, backgroundColor: T.surfaceAlt },
  voiceDoneText: { color: T.text, fontSize: FONT.sm, fontWeight: '600' },
  missingText: { color: T.primary, fontSize: FONT.sm, textAlign: 'center', marginTop: rp(8) },
  pitchLabel: { fontSize: rf(11), fontWeight: '700', color: T.textSecondary, letterSpacing: 0.8 },
  pitchInput: {
    width: '100%', minHeight: rs(64), borderRadius: RADIUS.md, backgroundColor: T.surfaceAlt,
    borderWidth: 1, borderColor: T.border, color: T.text, fontSize: FONT.md,
    paddingHorizontal: rp(14), paddingVertical: rp(12), textAlignVertical: 'top',
  },
  pitchCount: { fontSize: rf(10.5), color: T.textMute },
  intentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(6), marginTop: rp(4) },
  intentChip: { paddingHorizontal: rp(12), paddingVertical: rp(7), borderRadius: 999, borderWidth: 1, borderColor: T.border },
  intentChipOn: { borderColor: T.primary, backgroundColor: T.primaryDim },
  intentText: { fontSize: FONT.xs, fontWeight: '600', color: T.textSecondary },

  mediaSection: { width: '100%', alignItems: 'center', marginBottom: SPACING.lg },
  mediaAddBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(8),
    width: '100%', height: rs(48), borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: T.border, borderStyle: 'dashed',
    backgroundColor: T.surfaceAlt,
  },
  mediaAddText: { fontSize: FONT.sm, fontWeight: '600', color: T.text },
  mediaPreviewWrap: {
    width: rs(96), height: rs(96), borderRadius: RADIUS.md, overflow: 'hidden',
    backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border,
  },
  mediaPreview: { width: '100%', height: '100%' },
  mediaPlayBadge: {
    position: 'absolute', bottom: rp(6), left: rp(6),
    width: rs(22), height: rs(22), borderRadius: rs(11),
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  mediaRemoveBtn: {
    position: 'absolute', top: rp(6), right: rp(6),
    width: rs(20), height: rs(20), borderRadius: rs(10),
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  mediaHint: {
    fontSize: rf(10.5), color: T.textMute, textAlign: 'center',
    lineHeight: rf(15), marginTop: rp(8), paddingHorizontal: SPACING.sm,
  },

  priceRow: { flexDirection: 'row', alignItems: 'center', gap: rp(6), marginBottom: rp(6) },
  priceText: { fontSize: FONT.lg, fontWeight: '700', color: T.text },
  balanceText: { fontSize: FONT.xs, color: T.textMute, marginBottom: SPACING.xl },
  unlockBtn: {
    height: BUTTON_HEIGHT, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.primary, width: '100%',
    shadowColor: T.primary, shadowOffset: { width: 0, height: rs(8) }, shadowOpacity: 0.45, shadowRadius: rs(20), elevation: 10,
  },
  unlockBtnText: { color: '#fff', fontSize: FONT.lg, fontWeight: '700' },
  chargeNote: {
    fontSize: FONT.xs, color: T.textMute, textAlign: 'center',
    marginTop: rp(10), lineHeight: rf(17),
  },
  topUpBtn: {
    height: BUTTON_HEIGHT, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.surfaceAlt, width: '100%', borderWidth: 1, borderColor: T.border,
  },
  topUpBtnText: { color: T.text, fontSize: FONT.md, fontWeight: '700' },
  notNowBtn: { marginTop: SPACING.lg, padding: rp(8) },
  notNowText: { color: T.textSecondary, fontSize: FONT.sm, fontWeight: '500' },
});
