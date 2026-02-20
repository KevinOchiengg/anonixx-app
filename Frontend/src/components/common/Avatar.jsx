import React from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { User } from 'lucide-react-native';

const THEME = {
  avatarBg: '#3a3f50',
  avatarIcon: '#5a5f70',
};

export default function Avatar({ uri, size = 40 }) {
  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={[
            styles.image,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        />
      ) : (
        <User size={size * 0.5} color={THEME.avatarIcon} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: THEME.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
