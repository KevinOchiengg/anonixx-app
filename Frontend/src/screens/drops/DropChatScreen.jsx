/** Link Up chat between two connected people. The screen holds the thread and the
 * composer; bubbles, sheets, live updates and voice notes live in their own files:
 * components/chat/{ChatBubble, ChatIntro, ChatSheets, ChatMediaViewer}, hooks/{useChatSocket, useVoiceNote}.
 * Everything else (media, mute, pin, safety) is in Chat info: tap the name. */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView,
  ActivityIndicator, Animated, Image, Pressable, Alert, Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { SendHorizontal, X, Phone, MoreVertical, Mic, Trash2, BellOff, ChevronLeft } from 'lucide-react-native';

import { T } from '../../utils/colorTokens';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import PulseLoader from '../../components/common/PulseLoader';
import VoiceWaveform from '../../components/common/VoiceWaveform';
import ChatInputBar from '../../components/common/ChatInputBar';
import ChatBackground from '../../components/chat/ChatBackground';
import ChatBubble, { DateSeparator, TypingBubble, PreviewIcon, OWN_GRADIENT, messagePreviewLabel } from '../../components/chat/ChatBubble';
import { EmptyChat } from '../../components/chat/ChatIntro';
import { ChatMenuSheet, MessageSheet } from '../../components/chat/ChatSheets';
import ChatMediaViewer from '../../components/chat/ChatMediaViewer';
import { useToast } from '../../components/ui/Toast';
import { uploadToR2 } from '../../utils/upload';
import { API_BASE_URL } from '../../config/api';
import { CHAT_FONT_MAP, DEFAULT_CHAT_FONT } from '../../config/fonts';
import { DEFAULT_BACKGROUND_PATTERN } from '../../config/patterns';
import { useUnread } from '../../context/UnreadContext';
import { useSocket } from '../../context/SocketContext';
import useDraft from '../../hooks/useDraft';
import useChatSocket from '../../hooks/useChatSocket';
import useVoiceNote from '../../hooks/useVoiceNote';
import { callsApi, callParams } from '../../services/calls';
import { chatsApi } from '../../services/chats';
import { confirmBlock, confirmClear, sendFakeReport, sendReport } from '../../services/roomActions';

// Fallback poll; messages normally arrive over the socket.
const POLL_INTERVAL_MS = 25000;

// "Today" / "Yesterday" / date pills between message groups.
function formatDateLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

// Avatar fallback colours (same as MessagesScreen).
const AVATAR_COLORS = ['#C96F53', '#C97B84', '#D98E4A', '#B56576', '#A8674F'];
function avatarColorFor(seed) {
  if (!seed) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

async function authed(path, options = {}) {
  const token = await AsyncStorage.getItem('token');
  return fetch(`${API_BASE_URL}/api/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
}

export default function DropChatScreen({ route, navigation }) {
  const { connectionId } = route.params;
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { refreshUnread } = useUnread();
  const { socketService } = useSocket();

  const [messages, setMessages] = useState([]);
  const [connection, setConnection] = useState(null);
  const [chatProfile, setChatProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useDraft(`chat:${connectionId}`, ''); // unsent message survives leaving
  const [sending, setSending] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [viewerMedia, setViewerMedia] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [sheetItem, setSheetItem] = useState(null);   // long-pressed message
  const [menuOpen, setMenuOpen] = useState(false);
  const [callLoading, setCallLoading] = useState(false);

  const inputRef = useRef(null);
  const listRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const lastTypingEmit = useRef(0);
  const seenIds = useRef(null);   // messages already here when the chat opened (they don't animate in)

  const otherName = connection?.other_anonymous_name || 'Anonymous';
  const toastError = useCallback((m) => showToast({ type: 'error', message: m || 'Something went wrong.' }), [showToast]);
  const scrollToEnd = useCallback(() => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100), []);

  const isOtherTyping = useChatSocket(socketService, connectionId, setMessages, scrollToEnd);

  // ── Load + fallback poll ──────────────────────────────────
  const loadMessages = useCallback(async (silent = false) => {
    try {
      const res = await authed(`/drops/connections/${connectionId}/messages`);
      if (!res.ok) { if (!silent) toastError("Couldn't load messages."); return; }
      const data = await res.json();
      setMessages(data.messages);
      setConnection(data.connection);
      if (data.chat_profile) setChatProfile(data.chat_profile);
    } catch {
      if (!silent) toastError('Network error.');
    }
  }, [connectionId, toastError]);

  useEffect(() => {
    (async () => {
      await loadMessages(false);
      setLoading(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }).start();
      refreshUnread(); // opening the chat marks it read server-side
    })();
    const poll = setInterval(() => loadMessages(true), POLL_INTERVAL_MS);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sending ───────────────────────────────────────────────
  // Text, photo, video and voice all go through here; a pending reply rides along.
  const postMessage = useCallback(async (body) => {
    const replyToId = replyingTo?.id;
    setReplyingTo(null);
    const res = await authed(`/drops/connections/${connectionId}/message`, {
      method: 'POST',
      body: JSON.stringify({ ...body, ...(replyToId && { reply_to_id: replyToId }) }),
    });
    if (!res.ok) throw new Error();
    const sent = await res.json();
    setMessages((prev) => [...prev, { ...sent, is_own: true, seen: false }]);
    scrollToEnd();
  }, [connectionId, replyingTo, scrollToEnd]);

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content) return;
    setText('');
    setSending(true);
    try {
      await postMessage({ content });
    } catch {
      setText(content);
      toastError('Failed to send. Try again.');
    } finally {
      setSending(false);
    }
  }, [text, setText, postMessage, toastError]);

  const voice = useVoiceNote({
    showToast,
    send: async (uri, duration) => {
      const url = await uploadToR2(uri, 'audio', 'audio/m4a');
      if (!url) throw new Error();
      await postMessage({ media_url: url, media_type: 'voice', duration_seconds: duration });
    },
  });

  const pickMedia = useCallback(async () => {
    try {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) { showToast({ type: 'warning', message: 'Allow photo access to send media.' }); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        legacy: true,   // Android: pick straight from Gallery / Files, not the Google Photos picker
        mediaTypes: ['images', 'videos'], quality: 0.8, videoMaxDuration: 60,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const mediaType = asset.type === 'video' ? 'video' : 'image';
      // View once: they can open it a single time, then it's gone for them.
      const viewOnce = await new Promise((resolve) => Alert.alert(
        mediaType === 'video' ? 'Send this video' : 'Send this photo',
        'View once: they open it once, then it’s gone.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
          { text: 'View once', onPress: () => resolve(true) },
          { text: 'Send', onPress: () => resolve(false) },
        ],
        { cancelable: true, onDismiss: () => resolve(null) },
      ));
      if (viewOnce === null) return;
      setMediaUploading(true);
      const url = await uploadToR2(asset.uri, mediaType, mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
      if (url) await postMessage({ media_url: url, media_type: mediaType, view_once: viewOnce });
    } catch (e) {
      toastError(e?.message || 'Could not send. Try again.');
    } finally {
      setMediaUploading(false);
    }
  }, [postMessage, showToast, toastError]);

  // Typing signal, at most every 2s.
  const handleTextChange = useCallback((value) => {
    setText(value);
    const now = Date.now();
    if (now - lastTypingEmit.current > 2000) {
      lastTypingEmit.current = now;
      socketService.emit('typing', { connectionId });
    }
  }, [connectionId, socketService, setText]);

  // ── Message actions ───────────────────────────────────────
  const handleReply = useCallback((item) => {
    setSheetItem(null);
    setReplyingTo(item);
    setTimeout(() => inputRef.current?.focus(), 150);
  }, []);

  // React: same emoji again takes it back. Updated here first, then saved.
  const handleReact = useCallback(async (item, emoji, fromDoubleTap = false) => {
    setSheetItem(null);
    const mine = item.reactions?.find((r) => r.mine);
    if (fromDoubleTap && mine?.emoji === emoji) return; // a double tap only adds
    const next = (item.reactions || [])
      .map((r) => (r.mine ? { ...r, count: r.count - 1, mine: false } : r))
      .filter((r) => r.count > 0);
    if (mine?.emoji !== emoji) {
      const row = next.find((r) => r.emoji === emoji);
      if (row) { row.count += 1; row.mine = true; } else next.push({ emoji, count: 1, mine: true });
    }
    setMessages((prev) => prev.map((m) => (m.id === item.id ? { ...m, reactions: next } : m)));
    try {
      const res = await authed(`/drops/connections/${connectionId}/messages/${item.id}/react`, { method: 'POST', body: JSON.stringify({ emoji }) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMessages((prev) => prev.map((m) => (m.id === item.id ? { ...m, reactions: data.reactions } : m)));
    } catch {
      loadMessages(true);
    }
  }, [connectionId, loadMessages]);

  const handleCopy = useCallback(async (item) => {
    setSheetItem(null);
    try {
      await Clipboard.setStringAsync(item.content || '');
      showToast({ type: 'success', message: 'Copied.' });
    } catch {
      toastError('Could not copy.');
    }
  }, [showToast, toastError]);

  // "For me" hides it for you; "for everyone" replaces it for both, live.
  const deleteMessage = useCallback(async (item, forEveryone) => {
    setMessages((prev) => (forEveryone
      ? prev.map((m) => (m.id === item.id ? { ...m, deleted: true, content: '', media_url: null, media_type: null } : m))
      : prev.filter((m) => m.id !== item.id)));
    try {
      const res = await authed(`/drops/connections/${connectionId}/messages/${item.id}/delete`, {
        method: 'POST', body: JSON.stringify({ for_everyone: forEveryone }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toastError('Could not delete. Try again.');
      loadMessages(true);
    }
  }, [connectionId, loadMessages, toastError]);

  const handleDelete = useCallback((item) => {
    setSheetItem(null);
    if (!item.is_own) { deleteMessage(item, false); return; }
    Alert.alert('Delete message?', null, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'For me', onPress: () => deleteMessage(item, false) },
      { text: 'For everyone', style: 'destructive', onPress: () => deleteMessage(item, true) },
    ]);
  }, [deleteMessage]);

  const handleOpenViewOnce = useCallback(async (item) => {
    try {
      const res = await authed(`/drops/connections/${connectionId}/messages/${item.id}/open`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      setMessages((prev) => prev.map((m) => (m.id === item.id ? { ...m, opened: true } : m)));
      if (!res.ok || !data.media_url) { showToast({ type: 'info', message: data.detail || 'Already opened.' }); return; }
      setViewerMedia({ media_url: data.media_url, media_type: data.media_type });
    } catch {
      toastError('Could not open it. Try again.');
    }
  }, [connectionId, showToast, toastError]);

  const handleMediaPress = useCallback((item) => setViewerMedia({ media_url: item.media_url, media_type: item.media_type }), []);

  // ── Calls ─────────────────────────────────────────────────
  // One button: pick voice or video. Their Room settings decide what they take; the server says if not.
  const directCall = useCallback(async (video) => {
    if (callLoading) return;
    setCallLoading(true);
    try {
      const data = await callsApi.direct(connectionId, video);
      navigation.navigate('DropCall', callParams(data, {
        other: { name: otherName, avatar_url: chatProfile?.profile_picture_url, ...(data.other || {}) },
      }));
    } catch (err) {
      showToast({ type: err.status === 409 || err.status === 403 ? 'info' : 'error', message: err.message || 'Could not start the call.' });
    } finally {
      setCallLoading(false);
    }
  }, [callLoading, connectionId, navigation, otherName, chatProfile, showToast]);

  const handleCallPress = useCallback(() => {
    Alert.alert(`Call ${otherName}`, null, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Voice', onPress: () => directCall(false) },
      { text: 'Video', onPress: () => directCall(true) },
    ]);
  }, [otherName, directCall]);

  // ── ⋮ menu ────────────────────────────────────────────────
  const menu = {
    onMute: async (value) => {
      setMenuOpen(false);
      try {
        const prefs = await chatsApi.prefs(connectionId, { mute: value });
        setConnection((c) => ({ ...c, ...prefs }));
        showToast({ type: 'success', message: prefs.muted_until ? 'Muted.' : 'Notifications on.' });
      } catch (e) { toastError(e.message); }
    },
    onClear: () => {
      setMenuOpen(false);
      confirmClear(connectionId, (m) => { setMessages([]); showToast({ type: 'success', message: m }); }, toastError);
    },
    onReport: async (reason) => {
      setMenuOpen(false);
      try {
        await sendReport(connection.other_user_id, reason);
        showToast({ type: 'success', message: 'Report received. Thank you.' });
      } catch (e) { toastError(e.message); }
    },
    onReportFake: () => {
      setMenuOpen(false);
      Alert.alert('Their confession was fake?', "We'll review it. If it was, you get your coins back.", [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report it', style: 'destructive',
          onPress: () => sendFakeReport(connectionId)
            .then(() => showToast({ type: 'success', message: 'Report sent for review.' }))
            .catch((e) => toastError(e.message)),
        },
      ]);
    },
    onBlock: () => {
      setMenuOpen(false);
      confirmBlock(connection.other_user_id, (m) => { showToast({ type: 'success', message: m }); navigation.goBack(); }, toastError);
    },
  };

  // ── Thread ────────────────────────────────────────────────
  const fontFamily = useMemo(
    () => CHAT_FONT_MAP[chatProfile?.font_style] || CHAT_FONT_MAP[DEFAULT_CHAT_FONT],
    [chatProfile?.font_style],
  );

  const rows = useMemo(() => {
    const out = [];
    let last = null;
    for (const m of messages) {
      const label = formatDateLabel(m.created_at);
      if (label && label !== last) { out.push({ id: `sep-${m.id}`, kind: 'date', label }); last = label; }
      out.push(m);
    }
    return out;
  }, [messages]);

  useEffect(() => {
    if (!loading && seenIds.current === null) seenIds.current = new Set(messages.map((m) => m.id));
  }, [loading, messages]);

  // A run of messages from one side ends where the next row is the other side or a date pill.
  const renderRow = useCallback(({ item, index }) => (item.kind === 'date'
    ? <DateSeparator label={item.label} />
    : (
      <ChatBubble
        item={item}
        groupEnd={!rows[index + 1] || rows[index + 1].kind === 'date' || !!rows[index + 1].is_own !== !!item.is_own}
        fresh={!!seenIds.current && !seenIds.current.has(item.id)}
        fontFamily={fontFamily}
        otherName={otherName}
        onMediaPress={handleMediaPress}
        onReply={handleReply}
        onLongPress={setSheetItem}
        onReact={handleReact}
        onOpenViewOnce={handleOpenViewOnce}
      />
    )), [rows, fontFamily, otherName, handleMediaPress, handleReply, handleReact, handleOpenViewOnce]);

  // A guest sees the Room's picture; the owner sees the guest's own avatar.
  const headerPic = connection?.is_sender
    ? connection?.other_avatar_url
    : (chatProfile?.profile_picture_url || connection?.other_avatar_url);

  if (loading) {
    return (
      <SafeAreaView style={[s.safe, s.centered]} edges={['top', 'left', 'right']}>
        <PulseLoader size={52} color={T.primary} />
      </SafeAreaView>
    );
  }

  const openInfo = () => navigation.navigate('ChatInfo', { connectionId });
  const hasText = !!text.trim();
  const online = !!connection?.other_is_online;
  const headerH = insets.top + HEADER_H;

  // Frosted bar the thread scrolls under (real blur on iOS, tinted glass on Android).
  const header = (
    <View style={[s.header, { paddingTop: insets.top, height: headerH }]}>
      {Platform.OS === 'ios'
        ? <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        : null}
      <View style={[StyleSheet.absoluteFill, s.headerTint]} />
      <View style={s.headerRow}>
        <TouchableOpacity style={s.roundBtn} onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} accessibilityLabel="Back">
          <ChevronLeft size={rs(22)} color={T.text} strokeWidth={2.2} />
        </TouchableOpacity>
        <TouchableOpacity style={s.titleRow} activeOpacity={0.75} onPress={openInfo} accessibilityRole="button" accessibilityLabel={`${otherName}, contact info`}>
          <View style={[s.avatarRing, online && s.avatarRingOn]}>
            {headerPic ? (
              <Image source={{ uri: headerPic }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, s.avatarInitial, { backgroundColor: avatarColorFor(otherName) }]}>
                <Text style={s.avatarInitialText}>{otherName[0]?.toUpperCase() || 'A'}</Text>
              </View>
            )}
          </View>
          <View style={s.titleText}>
            <View style={s.nameRow}>
              <Text style={s.name} numberOfLines={1}>{otherName}</Text>
              {connection?.muted_until ? <BellOff size={rs(13)} color={T.textMute} strokeWidth={2} /> : null}
            </View>
            {isOtherTyping ? <Text style={s.typing}>typing…</Text>
              : online ? <Text style={s.online}>online</Text>
                : <Text style={s.hint}>tap for contact info</Text>}
          </View>
        </TouchableOpacity>
        {connection ? (
          <>
            <TouchableOpacity style={s.roundBtn} onPress={handleCallPress} disabled={callLoading} hitSlop={HIT_SLOP} accessibilityLabel="Call">
              <Phone size={rs(18)} color={T.text} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity style={s.roundBtn} onPress={() => setMenuOpen(true)} hitSlop={HIT_SLOP} accessibilityLabel="More">
              <MoreVertical size={rs(18)} color={T.text} strokeWidth={2} />
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={s.safe}>
      <ChatBackground pattern={chatProfile?.background_pattern || DEFAULT_BACKGROUND_PATTERN} style={StyleSheet.absoluteFill} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
            {messages.length === 0 ? (
              <View style={{ flex: 1, paddingTop: headerH }}>
                <EmptyChat />
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={rows}
                keyExtractor={(item) => item.id}
                renderItem={renderRow}
                contentContainerStyle={[s.list, { paddingTop: headerH + rp(10) }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                removeClippedSubviews
                initialNumToRender={14}
                maxToRenderPerBatch={10}
                windowSize={10}
                ListFooterComponent={isOtherTyping ? <TypingBubble /> : null}
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              />
            )}
          </Animated.View>

          {replyingTo && (
            <View style={s.replyBanner}>
              <View style={s.replyBar} />
              <View style={{ flex: 1 }}>
                <Text style={s.replyName} numberOfLines={1}>Replying to {replyingTo.is_own ? 'yourself' : otherName}</Text>
                <View style={s.replyRow}>
                  <PreviewIcon type={replyingTo.media_type} color={T.textMute} />
                  <Text style={s.replyPreview} numberOfLines={1}>{messagePreviewLabel(replyingTo)}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={HIT_SLOP} accessibilityLabel="Cancel reply">
                <X size={rs(16)} color={T.textMute} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          )}

          <ChatInputBar
            inputRef={inputRef}
            value={text}
            onChangeText={handleTextChange}
            placeholder="Drop your desires"
            maxLength={500}
            onAttachPress={!voice.isRecording && !voice.preview ? pickMedia : undefined}
            attachUploading={mediaUploading}
            floating
            paddingBottom={insets.bottom + rp(8)}
            recordingContent={voice.isRecording ? (
              <View style={s.recordRow}>
                <Animated.View style={[s.recordDot, { opacity: voice.pulse }]} />
                <Text style={s.recordTime}>{Math.floor(voice.duration / 60)}:{String(voice.duration % 60).padStart(2, '0')}</Text>
                <Text style={s.recordHint}>release to listen back</Text>
              </View>
            ) : voice.preview ? (
              <View style={s.recordRow}>
                <TouchableOpacity onPress={voice.discard} disabled={voice.uploading} hitSlop={HIT_SLOP} accessibilityLabel="Delete voice note">
                  <Trash2 size={rs(18)} color={T.textMute} strokeWidth={2} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <VoiceWaveform uri={voice.preview.uri} durationSeconds={voice.preview.duration} compact />
                </View>
              </View>
            ) : null}
            trailing={(
              // Empty field: hold to record. Text typed: tap to send.
              <Pressable
                onPressIn={!hasText && !voice.preview ? voice.pressIn : undefined}
                onPressOut={!hasText && !voice.preview ? voice.pressOut : undefined}
                onPress={voice.preview ? voice.sendPreview : hasText ? handleSend : undefined}
                disabled={voice.preview ? voice.uploading : hasText ? sending : false}
                accessibilityRole="button"
                accessibilityLabel={voice.preview ? 'Send voice note' : hasText ? 'Send' : 'Hold to record a voice note'}
                hitSlop={HIT_SLOP}
                // A small press bounce; the coral-to-rose circle matches my bubbles.
                style={({ pressed }) => [s.sendBtn, hasText && sending && { opacity: 0.4 }, (pressed || voice.isRecording) && { transform: [{ scale: voice.isRecording ? 1.12 : 0.9 }] }]}
              >
                <LinearGradient colors={OWN_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.sendFill}>
                  {(voice.preview ? voice.uploading : hasText ? sending : voice.uploading)
                    ? <ActivityIndicator size="small" color="#fff" />
                    : voice.preview || hasText
                      ? <SendHorizontal size={rs(20)} color="#fff" strokeWidth={2.2} />
                      : <Mic size={rs(21)} color="#fff" strokeWidth={2.2} />}
                </LinearGradient>
              </Pressable>
            )}
          />
        </KeyboardAvoidingView>
      {header}

      <ChatMenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        name={otherName}
        isGuest={!connection?.is_sender}
        mutedUntil={connection?.muted_until}
        {...menu}
      />
      <MessageSheet
        item={sheetItem}
        onClose={() => setSheetItem(null)}
        onReact={handleReact}
        onReply={handleReply}
        onCopy={handleCopy}
        onDelete={handleDelete}
      />
      {viewerMedia && <ChatMediaViewer media={viewerMedia} onClose={() => setViewerMedia(null)} />}
    </View>
  );
}

const HEADER_H = rs(60);

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  centered: { justifyContent: 'center', alignItems: 'center' },

  // Frosted header: back, avatar with an online ring, name and status, call and more.
  header: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  headerTint: { backgroundColor: Platform.OS === 'ios' ? 'rgba(18,10,20,0.45)' : 'rgba(18,10,20,0.88)' },
  headerRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: rp(8), paddingHorizontal: rp(10) },
  roundBtn: {
    width: rs(38), height: rs(38), borderRadius: rs(19), alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: rp(10), marginLeft: rp(2) },
  avatarRing: { padding: rs(2), borderRadius: rs(22), borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)' },
  avatarRingOn: { borderColor: T.online },
  avatar: { width: rs(36), height: rs(36), borderRadius: rs(18) },
  avatarInitial: { alignItems: 'center', justifyContent: 'center' },
  avatarInitialText: { fontSize: rf(15), fontFamily: 'DMSans-Bold', color: '#fff' },
  titleText: { flexShrink: 1, alignItems: 'flex-start' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: rp(5) },
  name: { fontFamily: 'DMSans-SemiBold', fontSize: rf(16.5), color: T.text, letterSpacing: 0.1 },
  typing: { fontFamily: 'DMSans-Medium', fontSize: rf(12), color: T.primary },
  online: { fontFamily: 'DMSans-Medium', fontSize: rf(12), color: T.online },
  hint: { fontFamily: 'DMSans-Regular', fontSize: rf(12), color: T.textMute },

  list: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md },

  replyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: rp(10), marginHorizontal: rp(12), marginBottom: rp(6),
    paddingHorizontal: rp(12), paddingVertical: rp(9), borderRadius: RADIUS.lg,
    backgroundColor: 'rgba(24,16,26,0.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: rp(5), marginTop: rp(2) },
  replyBar: { width: rs(3), alignSelf: 'stretch', borderRadius: rs(2), backgroundColor: T.primary, minHeight: rs(28) },
  replyName: { fontFamily: 'DMSans-Bold', fontSize: rf(12.5), color: T.primary },
  replyPreview: { fontFamily: 'DMSans-Regular', fontSize: rf(12), color: T.textMute, marginTop: rp(1) },

  // Replaces the text field while recording or listening back.
  recordRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: rp(8), paddingVertical: rp(10), paddingLeft: rp(4) },
  recordDot: { width: rs(9), height: rs(9), borderRadius: rs(5), backgroundColor: T.danger },
  recordTime: { fontFamily: 'DMSans-Bold', fontSize: rf(13), color: T.text, letterSpacing: 0.5, minWidth: rs(32) },
  recordHint: { flex: 1, fontFamily: 'DMSans-Italic', fontSize: rf(12), color: T.textMute },
  sendBtn: {
    width: rs(46), height: rs(46), borderRadius: rs(23),
    shadowColor: '#E8456E', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  sendFill: { flex: 1, borderRadius: rs(23), alignItems: 'center', justifyContent: 'center' },
});
