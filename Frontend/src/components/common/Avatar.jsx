import React from 'react';
import { View, StyleSheet } from 'react-native';
import T from '../../utils/theme';
import AuthorAvatar from './AuthorAvatar';

export default function Avatar({ uri, size = 40, name, seed, gender }) {
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      <AuthorAvatar uri={uri} seed={seed} name={name} gender={gender} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: T.avatarBg,
    overflow: 'hidden',
  },
});
