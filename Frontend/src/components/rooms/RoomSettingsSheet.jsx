/** The Room's ⋮ menu: one entry point to every Room setting, grouped. Each row opens "Your
 * Room" (ChatProfileSetup) on the matching tab, so there's still only one settings screen. */
import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Bell, ChevronRight, Coins, DoorOpen, Palette, Phone, Shield, Users, X,
} from 'lucide-react-native';
import { rs, rf, rp, SPACING, RADIUS, HIT_SLOP } from '../../utils/responsive';
import T from '../../utils/theme';

export const ROOM_SETTINGS = [
  { tab: 'room', Icon: Palette, title: 'Personalize Room', hint: 'Picture, theme, fonts' },
  { tab: 'inside', Icon: Users, title: 'Connections and visitors', hint: "Who's inside, remove, block, report, history" },
  { tab: 'calls', Icon: Phone, title: 'Calls and group sessions', hint: 'Who can call you, group room size' },
  { tab: 'knocks', Icon: DoorOpen, title: 'Knocks and coins', hint: 'Waiting knocks, what a Let In costs them' },
  { tab: 'privacy', Icon: Shield, title: 'Privacy and safety', hint: 'Who sees what, who can knock, where you show up' },
  { tab: 'notifications', Icon: Bell, title: 'Notifications', hint: 'Knocks, messages, calls, quiet hours' },
];

export default function RoomSettingsSheet({ visible, onClose, navigation }) {
  const go = (params, screen = 'ChatProfileSetup') => {
    onClose();
    navigation.navigate(screen, params);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.back}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel="Close Room settings" />
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.head}>
            <Text style={s.title}>Room settings</Text>
            <TouchableOpacity onPress={onClose} hitSlop={HIT_SLOP} accessibilityLabel="Close"><X size={rs(18)} color={T.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: rp(8) }}>
            {ROOM_SETTINGS.map(({ tab, Icon, title, hint }) => (
              <TouchableOpacity key={tab} style={s.row} onPress={() => go({ tab })} activeOpacity={0.8} accessibilityRole="button">
                <View style={s.icon}><Icon size={rs(18)} color={T.primary} strokeWidth={2} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{title}</Text>
                  <Text style={s.rowHint} numberOfLines={1}>{hint}</Text>
                </View>
                <ChevronRight size={rs(16)} color={T.textMute} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.row} onPress={() => go(undefined, 'Coins')} activeOpacity={0.8} accessibilityRole="button">
              <View style={s.icon}><Coins size={rs(18)} color={T.gold} strokeWidth={2} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>Coin history</Text>
                <Text style={s.rowHint} numberOfLines={1}>Your wallet and every transaction</Text>
              </View>
              <ChevronRight size={rs(16)} color={T.textMute} />
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '86%', backgroundColor: T.surface, borderTopLeftRadius: rs(22), borderTopRightRadius: rs(22),
    paddingHorizontal: SPACING.md, paddingBottom: rp(26), borderWidth: 1, borderColor: T.border,
  },
  handle: { alignSelf: 'center', width: rs(38), height: rs(4), borderRadius: 2, backgroundColor: T.borderStrong, marginTop: rp(8) },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: rp(14) },
  title: { fontFamily: 'DMSans-Bold', fontSize: rf(18), color: T.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: rp(12), paddingVertical: rp(11) },
  icon: { width: rs(40), height: rs(40), borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: T.border },
  rowTitle: { fontFamily: 'DMSans-Bold', fontSize: rf(15), color: T.text },
  rowHint: { fontFamily: 'DMSans-Regular', fontSize: rf(12.5), color: T.textSecondary, marginTop: rp(1) },
});
