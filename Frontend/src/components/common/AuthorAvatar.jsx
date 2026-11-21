import React, { useId, useMemo } from 'react';
import { Image, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { PORTRAIT_VIEWBOX, portraitFor } from '../../utils/portrait';

/** Fills its (round, overflow-hidden) container: the photo if set, otherwise a portrait. */
export default function AuthorAvatar({ uri, seed, name, gender }) {
  const id = useId().replace(/:/g, '');
  const p = useMemo(() => portraitFor(seed || name || '', gender), [seed, name, gender]);

  if (uri) return <Image source={{ uri }} style={StyleSheet.absoluteFill} />;

  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      viewBox={PORTRAIT_VIEWBOX}
      accessibilityRole="image"
      accessibilityLabel={p.label}
    >
      <Defs>
        <RadialGradient id={id} cx="50%" cy="30%" r="75%">
          <Stop offset="0" stopColor={p.glow} />
          <Stop offset="1" stopColor={p.bg} />
        </RadialGradient>
      </Defs>
      <Rect width="100" height="100" fill={`url(#${id})`} />
      {p.shapes.map((s, i) => {
        if (s.t === 'path') return <Path key={i} d={s.d} fill={s.fill} />;
        if (s.t === 'circle') return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} />;
        return <Ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={s.fill} />;
      })}
    </Svg>
  );
}
