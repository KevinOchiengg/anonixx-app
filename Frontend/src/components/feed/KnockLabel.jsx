import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** "Knock at Name’s door", centered; only the name shortens (with an ellipsis) when space runs out. */
export default function KnockLabel({ name, style }) {
  const who = name?.trim();
  const suffix = !who ? ' door' : /s$/i.test(who) ? '’ door' : '’s door';

  return (
    <View style={styles.row}>
      <Text style={style}>Knock at </Text>
      <Text style={[style, styles.name]} numberOfLines={1}>{who || 'their'}</Text>
      <Text style={style}>{suffix}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  name: { flexShrink: 1 },
});
