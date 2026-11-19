/** Full-screen viewer for one chat photo or video. Videos get the Anonixx player: coral play
 * button, coral progress you can tap or drag, time and mute. Web twin: Web/components/chat/BrandVideo.tsx. */
import React, { useEffect, useState } from 'react';
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { Pause, Play, Volume2, VolumeX, X } from 'lucide-react-native';
import T from '../../utils/theme';
import { rs, rp, RADIUS, HIT_SLOP, FONT } from '../../utils/responsive';

const fmt = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
const CORAL = [T.primary, '#ff8a73'];

function BrandPlayer({ uri }) {
  const player = useVideoPlayer({ uri }, (p) => { p.loop = false; p.play(); });
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [width, setWidth] = useState(1);

  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying }) => setPlaying(isPlaying));
    const id = setInterval(() => { setT(player.currentTime || 0); if (player.duration) setDur(player.duration); }, 250);
    return () => { sub.remove(); clearInterval(id); };
  }, [player]);

  const toggle = () => {
    if (playing) player.pause();
    else { if (dur && t >= dur - 0.2) player.currentTime = 0; player.play(); }
  };
  const seekTo = (x) => { if (dur) player.currentTime = Math.max(0, Math.min(dur, (x / width) * dur)); };
  const pct = dur ? Math.min(100, (t / dur) * 100) : 0;

  return (
    <View style={s.player}>
      <TouchableOpacity activeOpacity={1} onPress={toggle} style={s.fill}>
        <VideoView player={player} style={s.media} contentFit="contain" nativeControls={false} />
      </TouchableOpacity>
      {!playing && (
        <TouchableOpacity onPress={toggle} style={s.bigWrap} accessibilityLabel="Play" activeOpacity={0.85}>
          <LinearGradient colors={CORAL} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.big}>
            <Play size={rs(30)} color="#fff" fill="#fff" strokeWidth={0} style={{ marginLeft: rp(4) }} />
          </LinearGradient>
        </TouchableOpacity>
      )}
      <View style={s.bar}>
        <TouchableOpacity onPress={toggle} hitSlop={HIT_SLOP} style={s.small} accessibilityLabel={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={rs(14)} color="#fff" fill="#fff" strokeWidth={0} /> : <Play size={rs(14)} color="#fff" fill="#fff" strokeWidth={0} />}
        </TouchableOpacity>
        <View
          style={s.track}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width || 1)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => seekTo(e.nativeEvent.locationX)}
          onResponderMove={(e) => seekTo(e.nativeEvent.locationX)}
          accessibilityLabel="Seek"
        >
          <View style={s.rail} />
          <View style={[s.filled, { width: `${pct}%` }]} />
          <View style={[s.knob, { left: `${pct}%` }]} />
        </View>
        <Text style={s.time}>{fmt(t)} / {fmt(dur)}</Text>
        <TouchableOpacity onPress={() => { player.muted = !muted; setMuted(!muted); }} hitSlop={HIT_SLOP} accessibilityLabel={muted ? 'Unmute' : 'Mute'}>
          {muted ? <VolumeX size={rs(18)} color="#fff" /> : <Volume2 size={rs(18)} color="#fff" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ChatMediaViewer({ media, onClose }) {
  if (!media?.media_url) return null;
  const isVideo = media.media_type === 'video';

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={s.overlay}>
        {isVideo ? <BrandPlayer uri={media.media_url} /> : (
          <TouchableOpacity activeOpacity={1} onPress={onClose} style={s.fill}>
            <Image source={{ uri: media.media_url }} style={s.media} resizeMode="contain" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.close} onPress={onClose} hitSlop={HIT_SLOP} accessibilityLabel="Close">
          <X size={rs(18)} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  media: { width: '92%', height: '72%', borderRadius: RADIUS.lg },
  player: { flex: 1, width: '100%' },
  bigWrap: { position: 'absolute', top: '50%', left: '50%', marginTop: -rs(38), marginLeft: -rs(38) },
  big: {
    width: rs(76), height: rs(76), borderRadius: rs(38), alignItems: 'center', justifyContent: 'center',
    shadowColor: T.primary, shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10,
  },
  bar: { position: 'absolute', left: rp(16), right: rp(16), bottom: rp(40), flexDirection: 'row', alignItems: 'center', gap: rp(12) },
  small: { width: rs(34), height: rs(34), borderRadius: rs(17), backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  track: { flex: 1, height: rs(24), justifyContent: 'center' },
  rail: { height: rs(4), borderRadius: rs(2), backgroundColor: 'rgba(255,255,255,0.25)' },
  filled: { position: 'absolute', left: 0, height: rs(4), borderRadius: rs(2), backgroundColor: T.primary },
  knob: { position: 'absolute', width: rs(12), height: rs(12), marginLeft: -rs(6), borderRadius: rs(6), backgroundColor: '#fff', borderWidth: 2, borderColor: T.primary },
  time: { color: '#fff', fontSize: FONT.xs, fontVariant: ['tabular-nums'], opacity: 0.85 },
  close: {
    position: 'absolute', top: rp(50), right: rp(20), width: rs(34), height: rs(34), borderRadius: rs(17),
    backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center',
  },
});
