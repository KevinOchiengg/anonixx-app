import React from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { User } from 'lucide-react-native';
import T from '../../utils/theme';
import { rs } from '../../utils/responsive';

export default function Avatar({ uri, size = 40 }) {
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
        <User size={size * 0.5} color={T.avatarIcon} />
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
