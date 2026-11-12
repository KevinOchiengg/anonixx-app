/** Small shared pieces for the Rooms messenger: avatar, times, durations, and a chat list row. */
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BellOff, Camera, Check, Mic, Pin, Video as VideoIcon, Ban } from 'lucide-react-native';
import { rs, rf, rp, FONT, SPACING } from '../../utils/responsive';
import T from '../../utils/theme';

const AVATAR_COLORS = ['#C96F53', '#C97B84', '#D98E4A', '#B56576', '#A8674F'];

export function avatarColorFor(seed) {
  if (!seed) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function toDate(iso) {
  if (!iso) return null;
  const s = String(iso).replace(' ', 'T');
  const d = new Date(/Z$|[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "14:02", "Yesterday", "Tue", "Mar 4": how a messenger list shows times. */
export function chatTime(iso) {
  const d = toDate(iso);
  if (!d) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  const week = new Date(now); week.setDate(now.getDate() - 6);
  if (d > week) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

/** "Today, 14:02" / "Yesterday, 09:10" / "4 March, 18:30" for the call log. */
export function callTime(iso) {
  const d = toDate(iso);
  if (!d) return '';
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `Today, ${t}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday, ${t}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'long' })}, ${t}`;
}

export function duration(sec) {
  if (sec == null || sec < 1) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function Avatar({ name, url, size = rs(50), online, seed }) {
  return (
    <View style={{ width: size, height: size }}>
      <View style={[st.ava, { width: size, height: size, borderRadius: size / 2, backgroundColor: url ? T.avatarBg : avatarColorFor(seed || name) }]}>
        {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} />
          : <Text style={[st.avaText, { fontSize: size * 0.4 }]}>{(name || 'A')[0].toUpperCase()}</Text>}
      </View>
      {online ? <View style={[st.dot, { width: size * 0.26, height: size * 0.26, borderRadius: size * 0.13 }]} /> : null}
    </View>
  );
}

function PreviewIcon({ type }) {
  const p = { size: rs(14), color: T.textSecondary, strokeWidth: 2 };
  if (type === 'voice') return <Mic {...p} />;
  if (type === 'image') return <Camera {...p} />;
  if (type === 'video') return <VideoIcon {...p} />;
  return null;
}

/** One chat in the list. `selected` shows the check over the avatar (selection mode). */
export const ChatRow = React.memo(({ item, online, typing, selected, onPress, onLongPress }) => {
  const unread = item.unread_count > 0;
  const muted = !!item.muted_until;
  const text = item.last_message || (item.confession ? `“${item.confession}”` : 'Say hello');
  return (
    <TouchableOpacity
      style={[st.row, selected && st.rowSelected]}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress?.(item)}
      delayLongPress={300}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${item.other_anonymous_name}${unread ? `, ${item.unread_count} unread` : ''}`}
    >
      <View>
        <Avatar name={item.other_anonymous_name} url={item.other_avatar_url} online={online} seed={item.other_user_id} />
        {selected ? <View style={st.check}><Check size={rs(12)} color="#fff" strokeWidth={3} /></View> : null}
      </View>
      <View style={st.body}>
        <View style={st.top}>
          <Text style={[st.name, unread && st.nameUnread]} numberOfLines={1}>{item.other_anonymous_name}</Text>
          <Text style={[st.role, item.is_sender ? st.roleGuest : null]}>{item.is_sender ? 'guest' : 'their Room'}</Text>
          <View style={{ flex: 1 }} />
          <Text style={[st.time, unread && !muted && st.timeUnread]}>{chatTime(item.last_message_at)}</Text>
        </View>
        <View style={st.bottom}>
          {typing ? (
            <Text style={st.typing} numberOfLines={1}>typing…</Text>
          ) : (
            <View style={st.previewRow}>
              {item.last_message_is_own && !item.last_message_deleted ? (
                <Text style={item.last_message_seen ? st.tickSeen : st.tick}>{item.last_message_seen ? '✓✓' : '✓'}</Text>
              ) : null}
              {item.last_message_deleted ? <Ban size={rs(13)} color={T.textMuted} strokeWidth={2} /> : <PreviewIcon type={item.last_message_type} />}
              <Text style={[st.preview, unread && st.previewUnread, item.last_message_deleted && st.previewDeleted]} numberOfLines={1}>{text}</Text>
            </View>
          )}
          {muted ? <BellOff size={rs(15)} color={T.textMuted} strokeWidth={2} /> : null}
          {item.pinned ? <Pin size={rs(15)} color={T.textMuted} strokeWidth={2} style={{ transform: [{ rotate: '45deg' }] }} /> : null}
          {unread ? (
            <View style={[st.badge, muted && st.badgeMuted]}>
              <Text style={st.badgeText}>{item.unread_count > 99 ? '99+' : item.unread_count}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
});

export const st = StyleSheet.create({
  ava: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avaText: { color: '#fff', fontWeight: '800' },
  dot: { position: 'absolute', right: 0, bottom: 0, backgroundColor: T.online, borderWidth: 2, borderColor: T.background },
  row: { flexDirection: 'row', alignItems: 'center', gap: rp(14), paddingHorizontal: SPACING.md, paddingVertical: rp(11) },
  rowSelected: { backgroundColor: T.primaryTint },
  check: {
    position: 'absolute', right: -rp(2), bottom: -rp(2), width: rs(20), height: rs(20), borderRadius: rs(10),
    backgroundColor: T.primary, borderWidth: 2, borderColor: T.background, alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1, gap: rp(4), minWidth: 0 },
  top: { flexDirection: 'row', alignItems: 'center', gap: rp(6) },
  name: { fontSize: FONT.md, fontFamily: 'DMSans-SemiBold', color: T.text, flexShrink: 1 },
  nameUnread: { fontFamily: 'DMSans-Bold' },
  role: { fontSize: rf(10), fontFamily: 'DMSans-SemiBold', color: T.textMuted, letterSpacing: 0.2 },
  roleGuest: { color: T.violet },
  time: { fontSize: rf(11.5), color: T.textMuted },
  timeUnread: { color: T.primary, fontFamily: 'DMSans-Bold' },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: rp(6) },
  previewRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: rp(4), minWidth: 0 },
  tick: { fontSize: rf(12), color: T.textMuted, fontWeight: '700' },
  tickSeen: { fontSize: rf(12), color: T.primary, fontWeight: '800' },
  preview: { flex: 1, fontSize: FONT.sm, color: T.textSecondary },
  previewUnread: { color: T.text },
  previewDeleted: { fontStyle: 'italic', color: T.textMuted },
  typing: { flex: 1, fontSize: FONT.sm, color: T.primary, fontFamily: 'DMSans-SemiBold' },
  badge: { minWidth: rs(20), height: rs(20), borderRadius: rs(10), paddingHorizontal: rp(5), backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  badgeMuted: { backgroundColor: T.textMuted },
  badgeText: { fontSize: rf(10.5), fontWeight: '800', color: '#fff' },
});
