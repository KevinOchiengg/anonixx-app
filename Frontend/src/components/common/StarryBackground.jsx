import React from 'react';
import { View, Dimensions } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

const STARS = Array.from({ length: 60 }, (_, i) => ({
  id: i,
  top:     Math.random() * H,
  left:    Math.random() * W,
  size:    Math.random() * 2 + 0.5,
  opacity: Math.random() * 0.45 + 0.08,
}));

const StarryBackground = React.memo(() => (
  <>
    {STARS.map((s) => (
      <View
        key={s.id}
        style={{
          position:        'absolute',
          backgroundColor: '#FF634A',
          borderRadius:    s.size,
          top:             s.top,
          left:            s.left,
          width:           s.size,
          height:          s.size,
          opacity:         s.opacity,
          zIndex:          0,
        }}
      />
    ))}
  </>
));

export default StarryBackground;
