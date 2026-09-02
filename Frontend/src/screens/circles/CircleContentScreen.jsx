/**
 * CircleContentScreen.jsx
 *
 * The content feed inside a Circle — open to everyone, admin/creator posts
 * only. Posts can be free or coin-gated (blurred until unlocked) and carry
 * any mix of images, video, audio, or a generic file. Users comment with
 * text, a photo, a GIF, or a voice note (capped at 3 minutes). Tapping a
 * commenter opens the same profile sheet the main feed uses, with a "link
 * up" option — posts themselves stay unattributed (no author shown), unlike
 * Drops in the main feed.
 *
 * Regular (non-admin) users can buy an ad slot promoting one of their own
 * Drops — see Backend/app/api/v1/ads.py for the identical main-feed
 * mechanic this mirrors. Ads land as pending and only reach the feed once
 * the circle's creator/admin approves them; rejected ads are refunded in
 * full. Expired ads are cleared by a scheduled backend job.
 */
import React, {
  useState, useEffect, useCallback, useRef,
} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput,
  ActivityIndicator, Image, Modal, ScrollView, KeyboardAvoidingView, Platform,
  Dimensions, TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import {
  ArrowLeft, Lock, Plus, Megaphone, X, Film, Check, ShieldCheck, Clock,
  RotateCcw, MessageCircle, Play, Pause, FileText, Image as ImageIcon,
  Video as VideoIcon, Music, Paperclip, Send, Smile,
} from 'lucide-react-native';

import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP, BUTTON_HEIGHT } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';
import GifPicker from '../../components/common/GifPicker';
import VoiceNoteRecorder from '../../components/common/VoiceNoteRecorder';
import AnonProfileSheet from '../../components/connect/AnonProfileSheet';

const { width: W, height: H } = Dimensions.get('window');

// ─── Inline audio player — post audio_url or a comment's voice_url ───
const AudioPlayer = React.memo(({ uri, compact }) => {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const loaded = useRef(false);

  const playing  = !!status.playing;
  const duration = status.duration || 0;

  useEffect(() => () => { try { player.pause(); } catch {} }, [player]);

  useEffect(() => {
    if (status.didJustFinish) {
      try {
        player.pause();
        Promise.resolve(player.seekTo(0)).catch(() => {});
      } catch {}
    }
  }, [status.didJustFinish, player]);

  const toggle = useCallback(async () => {
    if (!uri) return;
    try {
      if (!loaded.current) {
        await setAudioModeAsync({ playsInSilentModeIOS: true });
        player.replace({ uri });
        loaded.current = true;
        player.play();
        return;
      }
      if (playing) player.pause();
      else player.play();
    } catch {}
  }, [uri, playing, player]);

  const fmt = (secs) => {
    const s = Math.max(0, Math.floor(secs || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <TouchableOpacity
      style={[s.audioWrap, compact && s.audioWrapCompact]}
      onPress={toggle}
      activeOpacity={0.85}
      hitSlop={HIT_SLOP}
    >
      <View style={s.audioPlayBtn}>
        {playing ? <Pause size={rs(14)} color="#fff" fill="#fff" /> : <Play size={rs(14)} color="#fff" fill="#fff" />}
      </View>
      <Text style={s.audioTimeText}>
        {playing || status.currentTime > 0 ? fmt(status.currentTime) : fmt(duration)}
      </Text>
    </TouchableOpacity>
  );
});

// ─── Post card ──────────────────────────────────────────────────
const PostCard = React.memo(({ post, auraColor, onUnlock, unlocking, onOpenComments }) => (
  <View style={[s.postCard, { borderLeftColor: auraColor }]}>
    {!post.locked && post.images?.length > 0 && (
      post.images.length === 1 ? (
        <Image source={{ uri: post.images[0] }} style={s.postMedia} resizeMode="cover" />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.postImageRow}>
          {post.images.map((uri, i) => (
            <Image key={i} source={{ uri }} style={s.postImageMulti} resizeMode="cover" />
          ))}
        </ScrollView>
      )
    )}
    {!post.locked && post.video_url && (
      <View style={[s.postMedia, s.postMediaVideo]}>
        <Film size={rs(28)} color={T.textMuted} />
      </View>
    )}
    {!post.locked && post.audio_url && (
      <View style={s.postAudioBlock}>
        <AudioPlayer uri={post.audio_url} />
      </View>
    )}
    {!post.locked && post.file_url && (
      <TouchableOpacity style={s.fileChip} activeOpacity={0.85}>
        <FileText size={rs(16)} color={T.textSecondary} />
        <Text style={s.fileChipText} numberOfLines={1}>{post.file_name || 'Attached file'}</Text>
      </TouchableOpacity>
    )}

    {post.locked && (
      <View style={[s.postMedia, s.lockedMedia]}>
        <Lock size={rs(22)} color="#fff" />
        <Text style={s.lockedText}>Blurred until unlocked</Text>
        <TouchableOpacity
          style={[s.unlockBtn, { backgroundColor: auraColor }]}
          onPress={() => onUnlock(post.id, post.unlock_price)}
          disabled={unlocking}
          activeOpacity={0.85}
        >
          {unlocking
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.unlockBtnText}>Unlock — {post.unlock_price} coins</Text>
          }
        </TouchableOpacity>
      </View>
    )}

    {!!post.caption && <Text style={s.postCaption}>{post.caption}</Text>}

    <TouchableOpacity style={s.commentsBtn} onPress={() => onOpenComments(post)} hitSlop={HIT_SLOP} activeOpacity={0.7}>
      <MessageCircle size={rs(14)} color={T.textMuted} />
      <Text style={s.commentsBtnText}>
        {post.comment_count > 0 ? `${post.comment_count} comment${post.comment_count === 1 ? '' : 's'}` : 'Comment'}
      </Text>
    </TouchableOpacity>
  </View>
));

// ─── Ad card ────────────────────────────────────────────────────
const AdCard = React.memo(({ ad, onPress }) => (
  <TouchableOpacity style={s.adCard} onPress={() => onPress(ad)} activeOpacity={0.85}>
    <View style={s.adBadge}>
      <Megaphone size={rs(10)} color={T.textMuted} />
      <Text style={s.adBadgeText}>AD</Text>
    </View>
    {ad.preview_image && <Image source={{ uri: ad.preview_image }} style={s.adImage} resizeMode="cover" />}
    <Text style={s.adTitle} numberOfLines={3}>{ad.preview_caption || 'View this drop'}</Text>
  </TouchableOpacity>
));

// ─── Comment item ───────────────────────────────────────────────
const CommentItem = React.memo(({ comment, onPressAuthor, onOpenImage }) => {
  const isOwn = !!comment.is_own;
  const mediaUri = comment.image_url || comment.gif_url;
  return (
    <View style={[s.commentRow, isOwn && s.commentRowOwn]}>
      <TouchableOpacity onPress={() => onPressAuthor(comment)} hitSlop={HIT_SLOP} style={[s.commentAvatar, isOwn && s.commentAvatarOwn]}>
        <Text style={s.commentAvatarText}>{comment.anonymous_name?.[0]?.toUpperCase() || 'A'}</Text>
      </TouchableOpacity>
      <View style={[s.commentBody, isOwn && s.commentBodyOwn]}>
        <TouchableOpacity onPress={() => onPressAuthor(comment)} hitSlop={HIT_SLOP}>
          <Text style={s.commentAuthor}>{isOwn ? 'You' : (comment.anonymous_name || 'Anonymous')}</Text>
        </TouchableOpacity>
        <View style={[s.commentBubble, isOwn && s.commentBubbleOwn]}>
          {!!comment.content && <Text style={[s.commentText, isOwn && s.commentTextOwn]}>{comment.content}</Text>}
          {!!mediaUri && (
            <TouchableOpacity activeOpacity={0.9} onPress={() => onOpenImage(mediaUri)}>
              <Image source={{ uri: mediaUri }} style={s.commentImage} resizeMode="cover" />
            </TouchableOpacity>
          )}
          {!!comment.voice_url && (
            <View style={{ marginTop: comment.content ? rp(6) : 0 }}>
              <AudioPlayer uri={comment.voice_url} compact />
            </View>
          )}
        </View>
      </View>
    </View>
  );
});

// ─── Comments sheet ─────────────────────────────────────────────
const CommentsSheet = React.memo(({ visible, circleId, post, onClose, onCountChange, onOpenProfile }) => {
  const { showToast } = useToast();
  const [comments, setComments]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [text, setText]           = useState('');
  const [pickedImage, setPickedImage] = useState(null);
  const [pickedGif, setPickedGif]     = useState(null);
  const [showGif, setShowGif]         = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [viewerUri, setViewerUri]     = useState(null);

  const authHeaders = useCallback(async (json = false) => {
    const token = await AsyncStorage.getItem('token');
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const load = useCallback(async () => {
    if (!post) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/posts/${post.id}/comments`,
        { headers: await authHeaders() },
      );
      if (res.ok) setComments((await res.json()).comments || []);
    } catch {
      showToast({ type: 'error', message: 'Could not load comments.' });
    } finally {
      setLoading(false);
    }
  }, [circleId, post, authHeaders, showToast]);

  useEffect(() => {
    if (visible) {
      setComments([]); setText(''); setPickedImage(null); setPickedGif(null);
      setShowGif(false);
      load();
    }
  }, [visible, load]);

  const handlePickImage = useCallback(async () => {
    setShowGif(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'warning', message: 'Gallery access is needed.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    setPickedGif(null);
    setPickedImage(result.assets[0].uri);
  }, [showToast]);

  const handleSelectGif = useCallback((url) => {
    setPickedImage(null);
    setPickedGif(url);
    setShowGif(false);
  }, []);

  const handleVoiceSend = useCallback(async ({ url, duration }) => {
    setSubmitting(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/posts/${post.id}/comments`,
        {
          method: 'POST',
          headers: await authHeaders(true),
          body: JSON.stringify({ voice_url: url, voice_duration: duration }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        setComments((prev) => [...prev, data]);
        onCountChange?.(post.id, 1);
      } else {
        showToast({ type: 'error', message: data.detail || 'Could not send voice note.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not send voice note.' });
    } finally {
      setSubmitting(false);
    }
  }, [circleId, post, authHeaders, showToast, onCountChange]);

  const handleSubmit = useCallback(async () => {
    if (!text.trim() && !pickedImage && !pickedGif) return;
    setSubmitting(true);
    try {
      let imageUrl = null;
      if (pickedImage) {
        const form = new FormData();
        form.append('file', { uri: pickedImage, name: 'comment.jpg', type: 'image/jpeg' });
        form.append('watermark', 'true');
        const upRes = await fetch(`${API_BASE_URL}/api/v1/upload/image`, {
          method: 'POST', headers: await authHeaders(), body: form,
        });
        if (!upRes.ok) throw new Error('Upload failed');
        imageUrl = (await upRes.json()).url;
      }

      const res = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/posts/${post.id}/comments`,
        {
          method: 'POST',
          headers: await authHeaders(true),
          body: JSON.stringify({
            content: text.trim(),
            image_url: imageUrl,
            gif_url: pickedGif,
          }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        setComments((prev) => [...prev, data]);
        setText(''); setPickedImage(null); setPickedGif(null);
        onCountChange?.(post.id, 1);
      } else {
        showToast({ type: 'error', message: data.detail || 'Could not comment.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not comment. Try again.' });
    } finally {
      setSubmitting(false);
    }
  }, [text, pickedImage, pickedGif, circleId, post, authHeaders, showToast, onCountChange]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.sheet, s.commentsSheet]}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Comments</Text>
            <TouchableOpacity onPress={onClose} hitSlop={HIT_SLOP}>
              <X size={rs(20)} color={T.textMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color={T.primary} style={{ marginVertical: rp(20) }} />
          ) : (
            <ScrollView style={s.commentsList} showsVerticalScrollIndicator={false}>
              {comments.map((c) => (
                <CommentItem key={c.id} comment={c} onPressAuthor={onOpenProfile} onOpenImage={setViewerUri} />
              ))}
              {comments.length === 0 && (
                <Text style={s.emptyText}>No comments yet. Say something.</Text>
              )}
            </ScrollView>
          )}

          {showGif && <GifPicker onSelect={handleSelectGif} />}

          {(pickedImage || pickedGif) && (
            <View style={s.commentPreviewRow}>
              <Image source={{ uri: pickedImage || pickedGif }} style={s.commentPreviewImg} />
              <TouchableOpacity onPress={() => { setPickedImage(null); setPickedGif(null); }} hitSlop={HIT_SLOP} style={s.commentPreviewRemove}>
                <X size={rs(12)} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          <View style={s.commentComposerRow}>
            <TouchableOpacity onPress={handlePickImage} hitSlop={HIT_SLOP} style={s.commentAttachBtn}>
              <ImageIcon size={rs(18)} color={T.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowGif((v) => !v)} hitSlop={HIT_SLOP} style={s.commentAttachBtn}>
              <Smile size={rs(18)} color={showGif ? T.primary : T.textMuted} />
            </TouchableOpacity>
            {/* Hold to record, release to send */}
            <VoiceNoteRecorder onSend={handleVoiceSend} />
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="say something…"
              placeholderTextColor={T.textMuted}
              style={s.commentInput}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting || (!text.trim() && !pickedImage && !pickedGif)}
              hitSlop={HIT_SLOP}
              style={[s.commentSendBtn, { opacity: submitting || (!text.trim() && !pickedImage && !pickedGif) ? 0.4 : 1 }]}
            >
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Send size={rs(15)} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <TouchableWithoutFeedback onPress={() => setViewerUri(null)}>
          <View style={s.viewerBackdrop}>
            <TouchableOpacity style={s.viewerCloseBtn} onPress={() => setViewerUri(null)} hitSlop={HIT_SLOP}>
              <X size={rs(22)} color="#fff" />
            </TouchableOpacity>
            <Image source={{ uri: viewerUri }} style={s.viewerImage} resizeMode="contain" />
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </Modal>
  );
});

// ─── Screen ─────────────────────────────────────────────────────
export default function CircleContentScreen({ route, navigation }) {
  const { circleId, circle } = route.params ?? {};
  const { showToast } = useToast();
  const auraColor = circle?.aura_color || T.primary;

  const [posts, setPosts]         = useState([]);
  const [ads, setAds]             = useState([]);
  const [loading, setLoading]     = useState(true);
  const [unlockingId, setUnlockingId] = useState(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [caption, setCaption]     = useState('');
  const [images, setImages]       = useState([]);
  const [videoUri, setVideoUri]   = useState(null);
  const [audioUri, setAudioUri]   = useState(null);
  const [audioName, setAudioName] = useState(null);
  const [fileUri, setFileUri]     = useState(null);
  const [fileName, setFileName]   = useState(null);
  const [isPaid, setIsPaid]       = useState(false);
  const [unlockPrice, setUnlockPrice] = useState('');
  const [posting, setPosting]     = useState(false);

  const [adModalOpen, setAdModalOpen] = useState(false);
  const [myDrops, setMyDrops]     = useState(null);
  const [selectedDropId, setSelectedDropId] = useState(null);
  const [adHours, setAdHours]     = useState('24');
  const [postingAd, setPostingAd] = useState(false);

  const [pendingAds, setPendingAds]       = useState([]);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [reviewingId, setReviewingId]     = useState(null);

  const [myAds, setMyAds]           = useState([]);
  const [myAdsOpen, setMyAdsOpen]   = useState(false);
  const [myAdsLoading, setMyAdsLoading] = useState(false);

  const [commentsPost, setCommentsPost] = useState(null);
  const [profileSheet, setProfileSheet] = useState({ visible: false });

  const canManage = !!(circle?.is_creator || circle?.is_admin);

  const authHeaders = useCallback(async (json = false) => {
    const token = await AsyncStorage.getItem('token');
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const requests = [
        fetch(`${API_BASE_URL}/api/v1/circles/${circleId}/posts`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/circles/${circleId}/ads`, { headers }),
      ];
      if (canManage) {
        requests.push(fetch(`${API_BASE_URL}/api/v1/circles/${circleId}/ads/pending`, { headers }));
      }
      const [postsRes, adsRes, pendingRes] = await Promise.all(requests);
      if (postsRes.ok) setPosts((await postsRes.json()).posts || []);
      if (adsRes.ok) setAds((await adsRes.json()).ads || []);
      if (pendingRes?.ok) setPendingAds((await pendingRes.json()).ads || []);
    } catch {
      showToast({ type: 'error', message: 'Could not load the circle feed.' });
    } finally {
      setLoading(false);
    }
  }, [circleId, canManage, authHeaders, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleUnlock = useCallback(async (postId, price) => {
    setUnlockingId(postId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/circles/${circleId}/posts/${postId}/unlock`, {
        method: 'POST',
        headers: await authHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setPosts((prev) => prev.map((p) => (p.id === postId ? data : p)));
      } else if (res.status === 402) {
        showToast({ type: 'warning', message: data.detail || 'Not enough coins.' });
        navigation.navigate('Coins');
      } else {
        showToast({ type: 'error', message: data.detail || 'Could not unlock.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not unlock. Try again.' });
    } finally {
      setUnlockingId(null);
    }
  }, [circleId, authHeaders, showToast, navigation]);

  // ── Composer media pickers ──────────────────────────────────
  const handlePickImages = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'warning', message: 'Gallery access is needed.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.85, allowsMultipleSelection: true, selectionLimit: 6,
    });
    if (result.canceled) return;
    setImages((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 6));
  }, [showToast]);

  const handlePickVideo = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'warning', message: 'Gallery access is needed.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.85 });
    if (result.canceled) return;
    setVideoUri(result.assets[0].uri);
  }, [showToast]);

  const handlePickAudio = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*' });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset) return;
    setAudioUri(asset.uri);
    setAudioName(asset.name);
  }, []);

  const handlePickFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset) return;
    setFileUri(asset.uri);
    setFileName(asset.name);
  }, []);

  const resetComposer = useCallback(() => {
    setCaption(''); setImages([]); setVideoUri(null);
    setAudioUri(null); setAudioName(null); setFileUri(null); setFileName(null);
    setIsPaid(false); setUnlockPrice('');
  }, []);

  const uploadRaw = useCallback(async (uri, name) => {
    const signRes = await fetch(`${API_BASE_URL}/api/v1/upload/sign`, {
      method: 'POST', headers: await authHeaders(true), body: JSON.stringify({ resource_type: 'raw' }),
    });
    if (!signRes.ok) throw new Error('Upload sign failed');
    const { signature, timestamp, api_key, cloud_name, folder } = await signRes.json();
    const form = new FormData();
    form.append('file', { uri, name: name || 'file', type: 'application/octet-stream' });
    form.append('api_key', api_key);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);
    form.append('folder', folder);
    const upRes = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/raw/upload`, { method: 'POST', body: form });
    const data = await upRes.json();
    if (!upRes.ok) throw new Error(data?.error?.message || 'Upload failed');
    return data.secure_url;
  }, [authHeaders]);

  const handleSubmitPost = useCallback(async () => {
    const hasMedia = images.length > 0 || videoUri || audioUri || fileUri;
    if (!caption.trim() && !hasMedia) {
      showToast({ type: 'warning', message: 'Add a caption or attach media.' });
      return;
    }
    setPosting(true);
    try {
      const uploadedImages = [];
      for (const uri of images) {
        const form = new FormData();
        form.append('file', { uri, name: 'circle_image.jpg', type: 'image/jpeg' });
        form.append('watermark', 'true');
        const res = await fetch(`${API_BASE_URL}/api/v1/upload/image`, { method: 'POST', headers: await authHeaders(), body: form });
        if (!res.ok) throw new Error('Image upload failed');
        uploadedImages.push((await res.json()).url);
      }

      let videoUrl = null;
      if (videoUri) {
        const form = new FormData();
        form.append('file', { uri: videoUri, name: 'circle_video.mp4', type: 'video/mp4' });
        form.append('watermark', 'true');
        const res = await fetch(`${API_BASE_URL}/api/v1/upload/video`, { method: 'POST', headers: await authHeaders(), body: form });
        if (!res.ok) throw new Error('Video upload failed');
        videoUrl = (await res.json()).url;
      }

      let audioUrl = null, audioDuration = null;
      if (audioUri) {
        const ext = audioName?.split('.').pop()?.toLowerCase() || 'm4a';
        const form = new FormData();
        form.append('file', { uri: audioUri, name: audioName || `circle_audio.${ext}`, type: `audio/${ext}` });
        const res = await fetch(`${API_BASE_URL}/api/v1/upload/audio`, { method: 'POST', headers: await authHeaders(), body: form });
        if (!res.ok) throw new Error('Audio upload failed');
        const data = await res.json();
        audioUrl = data.url;
        audioDuration = Math.round(data.duration || 0);
      }

      let fileUrl = null;
      if (fileUri) {
        fileUrl = await uploadRaw(fileUri, fileName);
      }

      const res = await fetch(`${API_BASE_URL}/api/v1/circles/${circleId}/posts`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({
          caption: caption.trim(),
          images: uploadedImages,
          video_url: videoUrl,
          audio_url: audioUrl,
          audio_duration: audioDuration,
          file_url: fileUrl,
          file_name: fileUrl ? fileName : null,
          unlock_price: isPaid ? (parseInt(unlockPrice, 10) || 0) : 0,
        }),
      });
      if (res.ok) {
        showToast({ type: 'success', message: 'Posted to the circle.' });
        setComposerOpen(false);
        resetComposer();
        load();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast({ type: 'error', message: data.detail || 'Could not post.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not post. Try again.' });
    } finally {
      setPosting(false);
    }
  }, [caption, images, videoUri, audioUri, audioName, fileUri, fileName, isPaid, unlockPrice, circleId, authHeaders, uploadRaw, showToast, load, resetComposer]);

  // ── Ads ──────────────────────────────────────────────────────
  const handleOpenAdModal = useCallback(async () => {
    setAdModalOpen(true);
    if (myDrops === null) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/ads/my-drops`, { headers: await authHeaders() });
        if (res.ok) {
          const data = await res.json();
          setMyDrops(data.drops || []);
          if (data.drops?.length) setSelectedDropId(data.drops[0].id);
        } else {
          setMyDrops([]);
        }
      } catch {
        setMyDrops([]);
      }
    }
  }, [myDrops, authHeaders]);

  const handleSubmitAd = useCallback(async () => {
    const hours = parseInt(adHours, 10);
    if (!selectedDropId || !hours) {
      showToast({ type: 'warning', message: 'Pick a drop and a duration.' });
      return;
    }
    setPostingAd(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/circles/${circleId}/ads`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ drop_id: selectedDropId, duration_hours: hours }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast({ type: 'success', message: data.message || `Ad submitted for review — ${data.coins_spent} coins.` });
        setAdModalOpen(false);
        setAdHours('24');
        load();
      } else if (res.status === 402) {
        showToast({ type: 'warning', message: data.detail || 'Not enough coins.' });
        navigation.navigate('Coins');
      } else {
        showToast({ type: 'error', message: data.detail || 'Could not post ad.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not post ad. Try again.' });
    } finally {
      setPostingAd(false);
    }
  }, [selectedDropId, adHours, circleId, authHeaders, showToast, load, navigation]);

  const handleReviewAd = useCallback(async (adId, approve) => {
    setReviewingId(adId);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/ads/${adId}/${approve ? 'approve' : 'reject'}`,
        { method: 'POST', headers: await authHeaders() },
      );
      const data = await res.json();
      if (res.ok) {
        showToast({ type: 'success', message: data.message || (approve ? 'Ad approved.' : 'Ad rejected.') });
        setPendingAds((prev) => prev.filter((a) => a.id !== adId));
        if (approve) load();
      } else {
        showToast({ type: 'error', message: data.detail || 'Could not review ad.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not review ad. Try again.' });
    } finally {
      setReviewingId(null);
    }
  }, [circleId, authHeaders, showToast, load]);

  const handleOpenMyAds = useCallback(async () => {
    setMyAdsOpen(true);
    setMyAdsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/circles/${circleId}/ads/mine`, {
        headers: await authHeaders(),
      });
      if (res.ok) setMyAds((await res.json()).ads || []);
      else showToast({ type: 'error', message: 'Could not load your ads.' });
    } catch {
      showToast({ type: 'error', message: 'Could not load your ads. Try again.' });
    } finally {
      setMyAdsLoading(false);
    }
  }, [circleId, authHeaders, showToast]);

  const handleAdPress = useCallback((ad) => {
    if (!ad.drop_id) {
      showToast({ type: 'info', message: 'This drop is no longer available.' });
      return;
    }
    // The ad payload already carries everything DropDetail needs for an
    // initial render (preview_caption/preview_image) — no extra fetch
    // required; engagement fields (likes/saves/comments) self-correct the
    // moment the user interacts, same pattern SavedPostsScreen uses.
    navigation.navigate('Feed', {
      screen: 'DropDetail',
      params: {
        post: {
          id:         ad.drop_id,
          content:    ad.preview_caption,
          media_url:  ad.preview_image,
          media_type: ad.preview_image ? 'image' : null,
        },
      },
    });
  }, [navigation, showToast]);

  // ── Comments / profile ──────────────────────────────────────
  const handleOpenComments = useCallback((post) => setCommentsPost(post), []);
  const handleCloseComments = useCallback(() => setCommentsPost(null), []);
  const handleCommentCountChange = useCallback((postId, delta) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, comment_count: (p.comment_count || 0) + delta } : p)));
  }, []);

  const handleOpenProfile = useCallback((comment) => {
    setProfileSheet({
      visible: true,
      userId: comment.user_id,
      anonymousName: comment.anonymous_name,
      linkupTarget: {
        target_type: 'circle_comment',
        target_id: comment.id,
        anonymous_name: comment.anonymous_name,
        preview_text: comment.content || (comment.voice_url ? 'Voice note' : comment.image_url ? 'Photo' : 'GIF'),
      },
    });
  }, []);
  const handleCloseProfile = useCallback(() => setProfileSheet({ visible: false }), []);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} style={s.headerBtn}>
          <ArrowLeft size={rs(20)} color={T.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{circle?.name || 'Circle'} feed</Text>
        <View style={s.headerActions}>
          {canManage && pendingAds.length > 0 && (
            <TouchableOpacity
              onPress={() => setModerationOpen(true)}
              hitSlop={HIT_SLOP}
              style={[s.headerBtn, s.headerBtnPending]}
            >
              <ShieldCheck size={rs(16)} color={auraColor} />
              <Text style={[s.headerBtnPendingText, { color: auraColor }]}>{pendingAds.length}</Text>
            </TouchableOpacity>
          )}
          {!canManage && (
            <TouchableOpacity onPress={handleOpenAdModal} hitSlop={HIT_SLOP} style={s.headerBtn}>
              <Megaphone size={rs(18)} color={T.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator color={auraColor} size="large" /></View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              auraColor={auraColor}
              onUnlock={handleUnlock}
              unlocking={unlockingId === item.id}
              onOpenComments={handleOpenComments}
            />
          )}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={ads.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.adRow}>
              {ads.map((ad) => <AdCard key={ad.id} ad={ad} onPress={handleAdPress} />)}
            </ScrollView>
          ) : null}
          ListEmptyComponent={
            <View style={s.centered}>
              <Text style={s.emptyText}>Nothing posted here yet.</Text>
            </View>
          }
        />
      )}

      {canManage && (
        <TouchableOpacity
          style={[s.fab, { backgroundColor: auraColor }]}
          onPress={() => setComposerOpen(true)}
          activeOpacity={0.88}
        >
          <Plus size={rs(24)} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      )}

      {/* ── Post composer (admin/creator only) ── */}
      <Modal visible={composerOpen} animationType="slide" transparent onRequestClose={() => setComposerOpen(false)}>
        <KeyboardAvoidingView style={s.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={s.sheet} keyboardShouldPersistTaps="handled">
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>New post</Text>
              <TouchableOpacity onPress={() => setComposerOpen(false)} hitSlop={HIT_SLOP}>
                <X size={rs(20)} color={T.textMuted} />
              </TouchableOpacity>
            </View>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="what are you dropping here…"
              placeholderTextColor={T.textMuted}
              style={s.sheetInput}
              multiline
              maxLength={500}
            />

            <View style={s.attachRow}>
              <TouchableOpacity style={s.attachBtn} onPress={handlePickImages} activeOpacity={0.85}>
                <ImageIcon size={rs(16)} color={images.length ? auraColor : T.textMuted} />
                <Text style={[s.attachBtnText, images.length && { color: auraColor }]}>
                  {images.length ? `${images.length} photo${images.length === 1 ? '' : 's'}` : 'Photos'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.attachBtn} onPress={handlePickVideo} activeOpacity={0.85}>
                <VideoIcon size={rs(16)} color={videoUri ? auraColor : T.textMuted} />
                <Text style={[s.attachBtnText, videoUri && { color: auraColor }]}>{videoUri ? 'Video ✓' : 'Video'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.attachBtn} onPress={handlePickAudio} activeOpacity={0.85}>
                <Music size={rs(16)} color={audioUri ? auraColor : T.textMuted} />
                <Text style={[s.attachBtnText, audioUri && { color: auraColor }]}>{audioUri ? 'Audio ✓' : 'Audio'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.attachBtn} onPress={handlePickFile} activeOpacity={0.85}>
                <Paperclip size={rs(16)} color={fileUri ? auraColor : T.textMuted} />
                <Text style={[s.attachBtnText, fileUri && { color: auraColor }]}>{fileUri ? 'File ✓' : 'File'}</Text>
              </TouchableOpacity>
            </View>

            {images.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.composerImageRow}>
                {images.map((uri, i) => (
                  <View key={i} style={s.composerImageWrap}>
                    <Image source={{ uri }} style={s.composerImageThumb} />
                    <TouchableOpacity
                      style={s.composerImageRemove}
                      onPress={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                      hitSlop={HIT_SLOP}
                    >
                      <X size={rs(10)} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            {/* Free / Paid toggle */}
            <View style={s.toggleRow}>
              <TouchableOpacity
                style={[s.toggleBtn, !isPaid && [s.toggleBtnActive, { backgroundColor: auraColor + '20', borderColor: auraColor }]]}
                onPress={() => setIsPaid(false)}
                activeOpacity={0.85}
              >
                <Text style={[s.toggleBtnText, !isPaid && { color: auraColor }]}>Free</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggleBtn, isPaid && [s.toggleBtnActive, { backgroundColor: auraColor + '20', borderColor: auraColor }]]}
                onPress={() => setIsPaid(true)}
                activeOpacity={0.85}
              >
                <Text style={[s.toggleBtnText, isPaid && { color: auraColor }]}>Paid to unlock</Text>
              </TouchableOpacity>
            </View>
            {isPaid && (
              <TextInput
                value={unlockPrice}
                onChangeText={(v) => setUnlockPrice(v.replace(/[^0-9]/g, ''))}
                placeholder="Price in coins"
                placeholderTextColor={T.textMuted}
                style={s.sheetInput}
                keyboardType="number-pad"
              />
            )}

            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: auraColor }]}
              onPress={handleSubmitPost}
              disabled={posting}
              activeOpacity={0.88}
            >
              {posting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.submitBtnText}>Post</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Ad form (regular users only) ── */}
      <Modal visible={adModalOpen} animationType="slide" transparent onRequestClose={() => setAdModalOpen(false)}>
        <KeyboardAvoidingView style={s.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Post an ad</Text>
              <TouchableOpacity onPress={() => setAdModalOpen(false)} hitSlop={HIT_SLOP}>
                <X size={rs(20)} color={T.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={s.sheetHint}>5 coins per hour it runs, charged now. Reviewed by the circle's admin before it goes live — refunded in full if it's rejected.</Text>
            <TouchableOpacity
              onPress={() => { setAdModalOpen(false); handleOpenMyAds(); }}
              hitSlop={HIT_SLOP}
              style={s.myAdsLink}
            >
              <Clock size={rs(12)} color={T.textMuted} />
              <Text style={s.myAdsLinkText}>See your ad history</Text>
            </TouchableOpacity>

            <Text style={s.fieldLabel}>Links to</Text>
            {myDrops === null ? (
              <ActivityIndicator color={auraColor} style={{ marginVertical: rp(12) }} />
            ) : myDrops.length === 0 ? (
              <View style={s.emptyDrops}>
                <Text style={s.emptyDropsText}>
                  You need an active Drop to advertise — this is what people land on when they tap your ad.
                </Text>
                <TouchableOpacity
                  style={[s.emptyDropsBtn, { backgroundColor: auraColor }]}
                  onPress={() => { setAdModalOpen(false); navigation.navigate('DropsCompose'); }}
                  activeOpacity={0.85}
                >
                  <Text style={s.emptyDropsBtnText}>Create a Drop</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView style={s.dropList} showsVerticalScrollIndicator={false}>
                {myDrops.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={[s.dropRow, selectedDropId === d.id && [s.dropRowActive, { borderColor: auraColor, backgroundColor: auraColor + '15' }]]}
                    onPress={() => setSelectedDropId(d.id)}
                    activeOpacity={0.8}
                  >
                    <View style={[s.dropCheck, selectedDropId === d.id && { backgroundColor: auraColor, borderColor: auraColor }]}>
                      {selectedDropId === d.id && <Check size={rs(11)} color="#fff" strokeWidth={3} />}
                    </View>
                    <Text style={s.dropRowText} numberOfLines={2}>{d.confession || '[media drop]'}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <TextInput
              value={adHours}
              onChangeText={(v) => setAdHours(v.replace(/[^0-9]/g, ''))}
              placeholder="Hours to run"
              placeholderTextColor={T.textMuted}
              style={s.sheetInput}
              keyboardType="number-pad"
            />
            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: auraColor }]}
              onPress={handleSubmitAd}
              disabled={postingAd || !myDrops?.length}
              activeOpacity={0.88}
            >
              {postingAd
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.submitBtnText}>
                    Submit for review — {(parseInt(adHours, 10) || 0) * 5} coins
                  </Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Ad moderation queue (creator/admin only) ── */}
      <Modal visible={moderationOpen} animationType="slide" transparent onRequestClose={() => setModerationOpen(false)}>
        <View style={s.modalWrap}>
          <View style={[s.sheet, s.moderationSheet]}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Ads awaiting review</Text>
              <TouchableOpacity onPress={() => setModerationOpen(false)} hitSlop={HIT_SLOP}>
                <X size={rs(20)} color={T.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={s.moderationList} showsVerticalScrollIndicator={false}>
              {pendingAds.map((ad) => (
                <View key={ad.id} style={s.pendingAdRow}>
                  {ad.preview_image && <Image source={{ uri: ad.preview_image }} style={s.pendingAdImage} resizeMode="cover" />}
                  <View style={s.pendingAdInfo}>
                    <Text style={s.pendingAdTitle} numberOfLines={2}>{ad.preview_caption || '[media drop]'}</Text>
                    <Text style={s.pendingAdMeta}>{ad.duration_hours}h run time</Text>
                  </View>
                  <View style={s.pendingAdActions}>
                    <TouchableOpacity
                      style={[s.reviewBtn, s.reviewBtnApprove]}
                      onPress={() => handleReviewAd(ad.id, true)}
                      disabled={reviewingId === ad.id}
                      hitSlop={HIT_SLOP}
                    >
                      {reviewingId === ad.id
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Check size={rs(16)} color="#fff" strokeWidth={2.4} />}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.reviewBtn, s.reviewBtnReject]}
                      onPress={() => handleReviewAd(ad.id, false)}
                      disabled={reviewingId === ad.id}
                      hitSlop={HIT_SLOP}
                    >
                      <X size={rs(16)} color="#fff" strokeWidth={2.4} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {pendingAds.length === 0 && (
                <Text style={s.emptyText}>Nothing waiting on review.</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── My ads — status history for whoever submitted them ── */}
      <Modal visible={myAdsOpen} animationType="slide" transparent onRequestClose={() => setMyAdsOpen(false)}>
        <View style={s.modalWrap}>
          <View style={[s.sheet, s.moderationSheet]}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Your ads</Text>
              <TouchableOpacity onPress={() => setMyAdsOpen(false)} hitSlop={HIT_SLOP}>
                <X size={rs(20)} color={T.textMuted} />
              </TouchableOpacity>
            </View>
            {myAdsLoading ? (
              <ActivityIndicator size="small" color={auraColor} style={{ marginVertical: rp(20) }} />
            ) : (
              <ScrollView style={s.moderationList} showsVerticalScrollIndicator={false}>
                {myAds.map((ad) => (
                  <View key={ad.id} style={s.myAdRow}>
                    <View style={s.myAdInfo}>
                      <Text style={s.pendingAdTitle} numberOfLines={2}>{ad.preview_caption || '[media drop]'}</Text>
                      {ad.status === 'pending' && (
                        <Text style={s.pendingAdMeta}>Awaiting review — {ad.duration_hours}h requested, {ad.coins_spent} coins held</Text>
                      )}
                      {ad.status === 'approved' && (
                        <Text style={s.pendingAdMeta}>
                          Live until {new Date(ad.expires_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      )}
                      {ad.status === 'rejected' && (
                        <Text style={s.pendingAdMeta}>Rejected — {ad.coins_spent} coins refunded</Text>
                      )}
                    </View>
                    <View style={[
                      s.statusBadge,
                      ad.status === 'approved' && s.statusBadgeApproved,
                      ad.status === 'rejected' && s.statusBadgeRejected,
                    ]}>
                      {ad.status === 'pending' && <Clock size={rs(11)} color={T.warning} />}
                      {ad.status === 'approved' && <Check size={rs(11)} color="#2e9e5b" />}
                      {ad.status === 'rejected' && <RotateCcw size={rs(11)} color="#c0392b" />}
                      <Text style={[
                        s.statusBadgeText,
                        ad.status === 'approved' && s.statusBadgeTextApproved,
                        ad.status === 'rejected' && s.statusBadgeTextRejected,
                      ]}>
                        {ad.status}
                      </Text>
                    </View>
                  </View>
                ))}
                {myAds.length === 0 && (
                  <Text style={s.emptyText}>You haven't submitted any ads in this circle yet.</Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Comments sheet ── */}
      <CommentsSheet
        visible={!!commentsPost}
        circleId={circleId}
        post={commentsPost}
        onClose={handleCloseComments}
        onCountChange={handleCommentCountChange}
        onOpenProfile={handleOpenProfile}
      />

      {/* ── Commenter profile + linkup ── */}
      <AnonProfileSheet
        visible={profileSheet.visible}
        userId={profileSheet.userId}
        anonymousName={profileSheet.anonymousName}
        linkupTarget={profileSheet.linkupTarget}
        onClose={handleCloseProfile}
        navigation={navigation}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: rp(12),
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: rp(8) },
  headerBtn: { padding: rp(4) },
  headerBtnPending: {
    flexDirection: 'row', alignItems: 'center', gap: rp(4),
    paddingHorizontal: rp(8), paddingVertical: rp(4),
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: T.border,
    backgroundColor: T.surfaceAlt,
  },
  headerBtnPendingText: { fontSize: rf(11), fontWeight: '700' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FONT.md, fontWeight: '700', color: T.text, fontFamily: 'PlayfairDisplay-Bold' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: rs(60) },
  emptyText: { color: T.textMuted, fontSize: FONT.sm, fontStyle: 'italic' },

  listContent: { padding: SPACING.md, paddingBottom: rs(100), gap: SPACING.md },

  // Ads
  adRow: { gap: rp(10), paddingBottom: SPACING.md },
  adCard: { width: rs(140), backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border, padding: rp(8), gap: rp(6) },
  adBadge: { flexDirection: 'row', alignItems: 'center', gap: rp(3), alignSelf: 'flex-start', backgroundColor: T.surfaceAlt, borderRadius: RADIUS.full, paddingHorizontal: rp(6), paddingVertical: rp(2) },
  adBadgeText: { fontSize: rf(8), color: T.textMuted, fontWeight: '700', letterSpacing: 0.5 },
  adImage: { width: '100%', height: rs(70), borderRadius: RADIUS.sm },
  adTitle: { fontSize: rf(11), color: T.text, fontWeight: '600', fontStyle: 'italic' },

  // Posts
  postCard: { backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border, borderLeftWidth: 3, overflow: 'hidden' },
  postMedia: { width: '100%', height: rs(220), backgroundColor: T.surfaceAlt },
  postMediaVideo: { alignItems: 'center', justifyContent: 'center' },
  postImageRow: { width: '100%' },
  postImageMulti: { width: rs(180), height: rs(220), marginRight: rp(2), backgroundColor: T.surfaceAlt },
  postAudioBlock: { padding: rp(14) },
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: rp(8), padding: rp(14) },
  fileChipText: { flex: 1, fontSize: FONT.sm, color: T.text },
  lockedMedia: { alignItems: 'center', justifyContent: 'center', gap: rp(8), backgroundColor: 'rgba(0,0,0,0.75)' },
  lockedText: { color: 'rgba(255,255,255,0.7)', fontSize: FONT.xs },
  unlockBtn: { paddingHorizontal: rp(18), paddingVertical: rp(10), borderRadius: RADIUS.full },
  unlockBtnText: { color: '#fff', fontSize: FONT.sm, fontWeight: '700' },
  postCaption: { padding: rp(14), paddingBottom: rp(6), color: T.text, fontSize: FONT.sm, lineHeight: rf(20) },
  commentsBtn: { flexDirection: 'row', alignItems: 'center', gap: rp(6), paddingHorizontal: rp(14), paddingVertical: rp(10) },
  commentsBtnText: { fontSize: rf(12), color: T.textMuted, fontWeight: '600' },

  // Audio player
  audioWrap: { flexDirection: 'row', alignItems: 'center', gap: rp(10), backgroundColor: T.surfaceAlt, borderRadius: RADIUS.full, paddingHorizontal: rp(10), paddingVertical: rp(6), alignSelf: 'flex-start' },
  audioWrapCompact: { paddingHorizontal: rp(8), paddingVertical: rp(4) },
  audioPlayBtn: { width: rs(26), height: rs(26), borderRadius: rs(13), backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  audioTimeText: { fontSize: rf(11), color: T.textSecondary, fontWeight: '600' },

  // FAB
  fab: {
    position: 'absolute', bottom: rs(24), right: rs(20),
    width: rs(52), height: rs(52), borderRadius: rs(26),
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: rs(4) }, shadowOpacity: 0.4, shadowRadius: rs(10), elevation: 8,
  },

  // Modals
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: T.background, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.md, gap: rp(10), borderWidth: 1, borderColor: T.border, borderBottomWidth: 0, maxHeight: '90%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: FONT.lg, fontWeight: '700', color: T.text, fontFamily: 'PlayfairDisplay-Bold' },
  sheetHint: { fontSize: rf(11), color: T.textMuted, fontStyle: 'italic', marginTop: -rp(4) },
  sheetInput: {
    backgroundColor: T.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: rp(14), paddingVertical: rp(12), color: T.text, fontSize: FONT.sm,
  },
  fieldLabel: { fontSize: FONT.xs, fontWeight: '700', color: T.textSecondary, marginTop: rp(4) },
  submitBtn: { height: BUTTON_HEIGHT, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginTop: rp(4), marginBottom: SPACING.md },
  submitBtnText: { color: '#fff', fontSize: FONT.md, fontWeight: '700' },

  // Composer attach row
  attachRow: { flexDirection: 'row', gap: rp(8), flexWrap: 'wrap' },
  attachBtn: {
    flexDirection: 'row', alignItems: 'center', gap: rp(6),
    backgroundColor: T.surfaceAlt, borderRadius: RADIUS.full, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: rp(12), paddingVertical: rp(8),
  },
  attachBtnText: { fontSize: rf(11), color: T.textMuted, fontWeight: '600' },
  composerImageRow: { maxHeight: rs(70) },
  composerImageWrap: { marginRight: rp(8), position: 'relative' },
  composerImageThumb: { width: rs(64), height: rs(64), borderRadius: RADIUS.sm, backgroundColor: T.surfaceAlt },
  composerImageRemove: {
    position: 'absolute', top: -rp(4), right: -rp(4), width: rs(18), height: rs(18), borderRadius: rs(9),
    backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center',
  },

  // Free/Paid toggle
  toggleRow: { flexDirection: 'row', gap: rp(8) },
  toggleBtn: {
    flex: 1, alignItems: 'center', paddingVertical: rp(10), borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: T.border, backgroundColor: T.surfaceAlt,
  },
  toggleBtnActive: { borderWidth: 1.5 },
  toggleBtnText: { fontSize: FONT.sm, fontWeight: '700', color: T.textMuted },

  // Ad moderation queue
  moderationSheet: { maxHeight: '75%' },
  moderationList: { marginTop: rp(4) },
  pendingAdRow: {
    flexDirection: 'row', alignItems: 'center', gap: rp(10),
    paddingVertical: rp(10), borderBottomWidth: 1, borderBottomColor: T.border,
  },
  pendingAdImage: { width: rs(48), height: rs(48), borderRadius: RADIUS.sm, backgroundColor: T.surfaceAlt },
  pendingAdInfo: { flex: 1, gap: rp(2) },
  pendingAdTitle: { fontSize: FONT.sm, fontWeight: '700', color: T.text, fontStyle: 'italic' },
  pendingAdMeta: { fontSize: rf(11), color: T.textMuted },
  pendingAdActions: { flexDirection: 'row', gap: rp(8) },
  reviewBtn: {
    width: rs(32), height: rs(32), borderRadius: rs(16),
    alignItems: 'center', justifyContent: 'center',
  },
  reviewBtnApprove: { backgroundColor: '#2e9e5b' },
  reviewBtnReject:  { backgroundColor: '#c0392b' },

  // "See your ad history" link inside the ad-post sheet
  myAdsLink: {
    flexDirection: 'row', alignItems: 'center', gap: rp(5),
    alignSelf: 'flex-start', marginTop: -rp(2),
  },
  myAdsLinkText: { fontSize: rf(11), color: T.textMuted, fontWeight: '600' },

  // Drop picker (ad target)
  emptyDrops: {
    backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border,
    padding: rp(16), gap: rp(10), alignItems: 'center',
  },
  emptyDropsText: { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', lineHeight: rf(19) },
  emptyDropsBtn: { borderRadius: RADIUS.md, paddingHorizontal: rp(18), paddingVertical: rp(10) },
  emptyDropsBtnText: { fontSize: FONT.sm, fontWeight: '700', color: '#fff' },
  dropList: { maxHeight: rs(180) },
  dropRow: {
    flexDirection: 'row', alignItems: 'center', gap: rp(10),
    backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border,
    padding: rp(12), marginBottom: rp(8),
  },
  dropRowActive: {},
  dropCheck: {
    width: rs(20), height: rs(20), borderRadius: rs(10), borderWidth: 1.5, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dropRowText: { flex: 1, fontSize: FONT.sm, color: T.text, fontStyle: 'italic' },

  // My ads — status history
  myAdRow: {
    flexDirection: 'row', alignItems: 'center', gap: rp(10),
    paddingVertical: rp(10), borderBottomWidth: 1, borderBottomColor: T.border,
  },
  myAdInfo: { flex: 1, gap: rp(2) },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: rp(4),
    paddingHorizontal: rp(8), paddingVertical: rp(4),
    borderRadius: RADIUS.full,
    backgroundColor: T.warningDim, borderWidth: 1, borderColor: T.warningBorder,
  },
  statusBadgeApproved: { backgroundColor: 'rgba(46,158,91,0.12)', borderColor: 'rgba(46,158,91,0.35)' },
  statusBadgeRejected: { backgroundColor: 'rgba(192,57,43,0.12)', borderColor: 'rgba(192,57,43,0.35)' },
  statusBadgeText: {
    fontSize: rf(10), fontWeight: '700', color: T.warning, textTransform: 'capitalize',
  },
  statusBadgeTextApproved: { color: '#2e9e5b' },
  statusBadgeTextRejected: { color: '#c0392b' },

  // Comments sheet
  commentsSheet: { height: '75%' },
  commentsList: { flex: 1, marginTop: rp(4) },
  commentRow: { flexDirection: 'row', gap: rp(10), paddingVertical: rp(10), borderBottomWidth: 1, borderBottomColor: T.border },
  commentRowOwn: { flexDirection: 'row-reverse' },
  commentAvatar: {
    width: rs(32), height: rs(32), borderRadius: rs(16), backgroundColor: T.primaryDim,
    alignItems: 'center', justifyContent: 'center',
  },
  commentAvatarOwn: { borderWidth: 1, borderColor: T.primary },
  commentAvatarText: { fontSize: rf(13), fontWeight: '700', color: T.primary },
  commentBody: { flex: 1, gap: rp(3) },
  commentBodyOwn: { alignItems: 'flex-end' },
  commentAuthor: { fontSize: rf(12), fontWeight: '700', color: T.text },
  // WhatsApp-style chat bubble
  commentBubble: {
    backgroundColor: T.surfaceAlt, borderRadius: rs(16), borderTopLeftRadius: rs(4),
    borderWidth: 1, borderColor: T.border,
    paddingHorizontal: rp(12), paddingVertical: rp(8),
    maxWidth: '92%', alignSelf: 'flex-start',
  },
  commentBubbleOwn: {
    backgroundColor: T.primaryDim, borderColor: T.primaryBorder,
    borderTopLeftRadius: rs(16), borderTopRightRadius: rs(4),
    alignSelf: 'flex-end',
  },
  commentText: { fontSize: FONT.sm, color: T.textSecondary, lineHeight: rf(19) },
  commentTextOwn: { color: T.text },
  commentImage: { width: rs(140), height: rs(100), borderRadius: RADIUS.sm },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  viewerCloseBtn: { position: 'absolute', top: rp(50), right: rp(20), zIndex: 10, padding: rp(8) },
  viewerImage: { width: W, height: H * 0.8 },
  commentPreviewRow: { position: 'relative', alignSelf: 'flex-start', marginTop: rp(6) },
  commentPreviewImg: { width: rs(56), height: rs(56), borderRadius: RADIUS.sm },
  commentPreviewRemove: {
    position: 'absolute', top: -rp(5), right: -rp(5), width: rs(18), height: rs(18), borderRadius: rs(9),
    backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center',
  },
  commentComposerRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: rp(6),
    borderTopWidth: 1, borderTopColor: T.border, paddingTop: rp(10), marginTop: rp(6),
  },
  commentAttachBtn: { padding: rp(6) },
  commentInput: {
    flex: 1, backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: rp(12), paddingVertical: rp(8), color: T.text, fontSize: FONT.sm, maxHeight: rs(90),
  },
  commentSendBtn: {
    width: rs(34), height: rs(34), borderRadius: rs(17), backgroundColor: T.primary,
    alignItems: 'center', justifyContent: 'center',
  },
});
