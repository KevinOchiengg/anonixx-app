import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

// Text over a video drop. Positions are 0-1 centre fractions, sizes a share of width (same as the website).
const SIZE = { s: 0.046, m: 0.064, l: 0.088 };

const Overlay = ({ o, width, height }) => {
  const [h, setH] = useState(0);
  const fontSize = width * (SIZE[o.size] || SIZE.m);
  const boxW = width * 0.86;
  return (
    <View
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
      style={{
        position: 'absolute',
        width: boxW,
        left: o.x * width - boxW / 2,
        top: o.y * height - h / 2,
        alignItems: 'center',
        opacity: h ? 1 : 0, // hidden for the one frame before it's measured and centred
      }}
    >
      <Text
        style={[
          s.text,
          { fontSize, lineHeight: fontSize * 1.22, borderRadius: fontSize * 0.38 },
          o.style === 'shadow' ? s.shadow : { paddingHorizontal: fontSize * 0.55, paddingVertical: fontSize * 0.22 },
          o.style === 'dark' && s.dark,
          o.style === 'coral' && s.coral,
        ]}
      >
        {o.text}
      </Text>
    </View>
  );
};

const VideoOverlays = ({ overlays }) => {
  const [box, setBox] = useState(null);
  if (!overlays?.length) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setBox(e.nativeEvent.layout)}>
      {box ? overlays.map((o, i) => <Overlay key={i} o={o} width={box.width} height={box.height} />) : null}
    </View>
  );
};

const s = StyleSheet.create({
  text: { color: '#fff', fontWeight: '800', textAlign: 'center', overflow: 'hidden' },
  shadow: { textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  dark: { backgroundColor: 'rgba(10,12,20,0.62)' },
  coral: { backgroundColor: '#FF634A' },
});

export default VideoOverlays;
