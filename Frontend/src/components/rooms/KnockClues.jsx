/** What a host sees on a Knock: signals about the knocker, their peek and photo/video (blurred
 * until tapped), and voice note. Same as the website's. */
import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Video as VideoIcon } from 'lucide-react-native';
import { T } from '../../utils/colorTokens';
import { rs, rf, rp, RADIUS } from '../../utils/responsive';
import VoiceWaveform from '../common/VoiceWaveform';

const age = (d) => {
  if (d == null) return null;
  if (d < 7) return `new here (${d || '<1'} day${d === 1 ? '' : 's'})`;
  if (d < 60) return `${Math.floor(d / 7)} weeks on Anonixx`;
  if (d < 730) return `${Math.floor(d / 30)} months on Anonixx`;
  return `${Math.floor(d / 365)} years on Anonixx`;
};

export function signalChips(s) {
  if (!s) return [];
  const out = [];
  if (s.deception_strikes) out.push({ text: `${s.deception_strikes} confirmed deception report${s.deception_strikes === 1 ? '' : 's'}`, tone: 'bad' });
  if (s.likes_you && s.you_like_them) out.push({ text: "you like each other's drops", tone: 'good' });
  else if (s.likes_you) out.push({ text: 'likes your drops', tone: 'good' });
  else if (s.you_like_them) out.push({ text: 'you liked their drops' });
  if (s.knocks_decided) out.push({ text: `let in by ${s.let_in} of ${s.knocks_decided} hosts`, tone: s.let_in / s.knocks_decided >= 0.5 ? 'good' : undefined });
  else out.push({ text: 'first knock' });
  if (s.verified) out.push({ text: 'verified', tone: 'good' });
  const a = age(s.account_age_days);
  if (a) out.push({ text: a });
  out.push({ text: s.drops ? `${s.drops} drop${s.drops === 1 ? '' : 's'}` : 'no drops yet' });
  return out;
}

export default function KnockClues({ item, onOpenMedia }) {
  const [shown, setShown] = useState({});
  const items = [
    ...(item.peek || []),
    ...(item.media_url ? [{ media_url: item.media_url, media_type: item.media_type || 'image' }] : []),
  ];
  const chips = signalChips(item.signals);

  return (
    <View style={s.wrap}>
      {chips.length > 0 && (
        <View style={s.chips}>
          {chips.map((c) => (
            <Text key={c.text} style={[s.chip, c.tone === 'good' && s.chipGood, c.tone === 'bad' && s.chipBad]}>{c.text}</Text>
          ))}
        </View>
      )}
      {items.length > 0 && (
        <View style={s.tiles}>
          {items.map((it) => {
            const open = !!shown[it.media_url];
            const isVideo = it.media_type === 'video';
            return (
              <TouchableOpacity
                key={it.media_url}
                style={s.tile}
                activeOpacity={0.85}
                onPress={() => (open || isVideo ? onOpenMedia?.({ url: it.media_url, type: it.media_type }) : setShown((cur) => ({ ...cur, [it.media_url]: true })))}
                accessibilityLabel={open ? 'Open full size' : `Show ${isVideo ? 'video' : 'photo'}`}
              >
                {isVideo ? (
                  <View style={[s.img, s.videoTile]}><VideoIcon size={rs(18)} color="#fff" /></View>
                ) : (
                  <Image source={{ uri: it.media_url }} style={s.img} blurRadius={open ? 0 : 40} />
                )}
                {!open && (
                  <View style={s.veil}>
                    <Text style={s.veilKind}>{isVideo ? 'VIDEO' : 'PHOTO'}</Text>
                    <Text style={s.veilHint}>tap to see</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {!!item.voice_url && (
        <View style={s.voice}>
          <Text style={s.voiceLabel}>voice note{item.voice_duration ? ` · ${Math.round(item.voice_duration)}s` : ''}</Text>
          <VoiceWaveform uri={item.voice_url} durationSeconds={item.voice_duration || 0} compact />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: rp(8), marginTop: rp(8) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(6) },
  chip: { fontSize: rf(11), fontWeight: '600', color: T.textSecondary, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: rp(8), paddingVertical: rp(3), borderRadius: 999, overflow: 'hidden' },
  chipGood: { color: '#34d399', backgroundColor: 'rgba(52,211,153,0.14)' },
  chipBad: { color: '#ff5d6c', backgroundColor: 'rgba(255,93,108,0.16)' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8) },
  tile: { width: rs(70), height: rs(92), borderRadius: RADIUS.md, overflow: 'hidden', backgroundColor: '#000' },
  img: { width: '100%', height: '100%' },
  videoTile: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1f2e' },
  veil: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  veilKind: { color: '#fff', fontSize: rf(10), fontWeight: '800', letterSpacing: 1 },
  veilHint: { color: 'rgba(255,255,255,0.85)', fontSize: rf(10) },
  voice: { gap: rp(4) },
  voiceLabel: { fontSize: rf(11), color: T.textSecondary },
});
