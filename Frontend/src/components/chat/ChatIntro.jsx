/** An empty chat: just a hello. */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { T } from '../../utils/colorTokens';
import { rs, rf, rp, FONT, SPACING } from '../../utils/responsive';

export const EmptyChat = React.memo(() => (
  <View style={s.empty}>
    <Sparkles size={rs(22)} color={T.primary} strokeWidth={1.8} />
    <Text style={s.emptyText}>You're both anonymous. Say the first thing.</Text>
  </View>
));

const s = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: rp(8), padding: SPACING.lg },
  emptyText: { fontFamily: 'DMSans-Medium', fontSize: FONT.md, color: T.textSec, textAlign: 'center', lineHeight: rf(22) },
});
