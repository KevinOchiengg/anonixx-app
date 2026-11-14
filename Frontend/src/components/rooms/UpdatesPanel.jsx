/** Rooms → My Room: the page visitors see when they peek, and once they're in. */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { rf, rp, FONT, SPACING } from '../../utils/responsive';
import T from '../../utils/theme';
import MyRoomPanel from './MyRoomPanel';

export default function UpdatesPanel({ navigation }) {
  const header = (
    <View style={s.head}>
      <Text style={s.h}>Your Room</Text>
      <Text style={s.note}>What they see when they peek, and once they're in.</Text>
    </View>
  );
  return <MyRoomPanel navigation={navigation} header={header} />;
}

const s = StyleSheet.create({
  head: { marginHorizontal: -SPACING.md, marginTop: -SPACING.md + rp(4) },
  h: { fontSize: rf(18), fontFamily: 'DMSans-Bold', color: T.text, paddingHorizontal: SPACING.md, marginBottom: rp(4) },
  note: { fontSize: FONT.xs, color: T.textSecondary, paddingHorizontal: SPACING.md, lineHeight: FONT.xs * 1.5 },
});
