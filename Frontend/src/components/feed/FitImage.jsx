/** Feed photo (utils/mediaFit): phone-shaped fills the slide; others sit whole over a blurred copy. */
import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { fillsFrame } from '../../utils/mediaFit';

export function FitBackdrop({ uri }) {
  if (!uri) return null;
  return (
    <>
      <Image source={{ uri }} style={s.blur} resizeMode="cover" blurRadius={28} pointerEvents="none" />
      <View style={s.dim} pointerEvents="none" />
    </>
  );
}

export default function FitImage({ uri, style }) {
  const [frame, setFrame] = useState(null);
  const [size, setSize] = useState(null);
  const fill = !!frame && !!size && fillsFrame(size.width, size.height, frame.width, frame.height);
  return (
    <View
      style={[s.frame, style]}
      onLayout={(e) => setFrame(e.nativeEvent.layout)}
    >
      {!fill && <FitBackdrop uri={uri} />}
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode={fill ? 'cover' : 'contain'}
        onLoad={(e) => {
          const src = e.nativeEvent?.source;
          if (src?.width && src?.height) setSize({ width: src.width, height: src.height });
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: '#000' },
  blur: { ...StyleSheet.absoluteFillObject, transform: [{ scale: 1.15 }] },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
});
