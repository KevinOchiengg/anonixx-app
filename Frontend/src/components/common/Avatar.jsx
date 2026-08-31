import React from 'react';
import { Image, View, Text, StyleSheet } from 'react-native';
import T from '../../utils/theme';
import { rs } from '../../utils/responsive';

// Real photo if the user set one, otherwise the first initial of their
// name — no emoji/preset avatars.
export default function Avatar({ uri, size = 40, name }) {
  return (
    <View style={[
      styles.container,
      { width: size, height: size, borderRadius: size / 2 },
    ]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <Text style={{ fontSize: size * 0.4, fontWeight: '700', color: T.primary }}>
          {name?.[0]?.toUpperCase() || '?'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: T.avatarBg,
    alignItems:      'center',
    justifyContent:  'center',
    overflow:        'hidden',
  },
});
