import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { useUnread } from '../../context/UnreadContext';
import { rs, rf, HIT_SLOP } from '../../utils/responsive';
import T from '../../utils/theme';

export default function NotificationBell({ onPress, style }) {
  const { badgeCounts } = useUnread();
  const n = badgeCounts.Activity || 0;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={style}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={n ? `Notifications, ${n} new` : 'Notifications'}
    >
      <Bell size={rs(18)} color="#fff" />
      {n ? (
        <View style={s.badge}>
          <Text style={s.badgeText}>{n > 99 ? '99+' : n}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  badge: {
    position: 'absolute', top: -rs(4), right: -rs(4), minWidth: rs(18), height: rs(18), paddingHorizontal: rs(5),
    borderRadius: rs(9), backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: T.background,
  },
  badgeText: { color: '#fff', fontSize: rf(10), fontWeight: '700' },
});
