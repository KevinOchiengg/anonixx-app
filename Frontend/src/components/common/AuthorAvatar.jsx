import React, { useMemo } from 'react';
import { Image, StyleSheet } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path } from 'react-native-svg';
import { PORTRAIT_VIEWBOX, portraitFor } from '../../utils/portrait';

const [VX, VY, VW, VH] = PORTRAIT_VIEWBOX.split(' ').map(Number);
const CX = VX + VW / 2;
const CY = VY + VH / 2;
const R = Math.min(VW, VH) / 2;

/** Fills its round container: the photo if set, otherwise a portrait. Both clip to a circle
 * themselves, since Android doesn't always clip children to a rounded parent. */
export default function AuthorAvatar({ uri, seed, name, gender }) {
  const p = useMemo(() => portraitFor(seed || name || '', gender), [seed, name, gender]);
  const clipId = useMemo(() => `ava-${Math.random().toString(36).slice(2, 9)}`, []);

  if (uri) return <Image source={{ uri }} style={[StyleSheet.absoluteFill, styles.round]} />;

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
        <ClipPath id={clipId}>
          <Circle cx={CX} cy={CY} r={R} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        {p.shapes.map((s, i) => {
          if (s.t === 'path') return <Path key={i} d={s.d} fill={s.fill} />;
          if (s.t === 'circle') return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} />;
          return <Ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={s.fill} />;
        })}
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  round: { borderRadius: 9999 },
});
