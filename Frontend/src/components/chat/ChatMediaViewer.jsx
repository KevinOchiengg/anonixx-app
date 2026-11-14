/** Full-screen viewer for one chat photo or video. Tap anywhere or X to close. */
import React from 'react';
import { Image, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { X } from 'lucide-react-native';
import { rs, rp, RADIUS, HIT_SLOP } from '../../utils/responsive';

export default function ChatMediaViewer({ media, onClose }) {
  const isVideo = media?.media_type === 'video';
  const player = useVideoPlayer(isVideo && media?.media_url ? { uri: media.media_url } : null, (p) => { p.play(); });
  if (!media?.media_url) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={s.fill}>
          {isVideo ? (
            <VideoView player={player} style={s.media} contentFit="contain" nativeControls />
          ) : (
            <Image source={{ uri: media.media_url }} style={s.media} resizeMode="contain" />
          )}
        </TouchableOpacity>
        <TouchableOpacity style={s.close} onPress={onClose} hitSlop={HIT_SLOP} accessibilityLabel="Close">
          <X size={rs(18)} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  media: { width: '88%', height: '70%', borderRadius: RADIUS.lg },
  close: {
    position: 'absolute', top: rp(50), right: rp(20), width: rs(34), height: rs(34), borderRadius: rs(17),
    backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center',
  },
});
