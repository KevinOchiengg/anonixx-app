/** The Anonixx backdrop: a warm plum base with soft coral glows, scattered coral drops and
 * shadowed edges (the anonymous, late-night feel).
 * Mirrors Web/public/bg-drops.svg (same shapes, same places) so the app and the site match.
 * `withBackdrop(Screen)` puts it behind a screen (screen roots keep a transparent background)
 * and adds the coral "● ANONIXX" mark in a slim row at the top; `{ brand: false }` leaves the
 * mark off (feed, chats, calls, Rooms, camera, sign-in screens that show their own). */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { rf, rp, rs, SPACING } from '../../utils/responsive';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import T from '../../utils/theme';

const CORAL = '#FF634A';

// [cx, cy, size, rotation, opacity, outline] in a 400 x 820 canvas.
const DROPS = [
  [330, 70, 46, 18, 0.30, false],
  [62, 150, 22, -12, 0.22, false],
  [360, 250, 14, 30, 0.35, false],
  [40, 330, 58, -20, 0.12, true],
  [300, 420, 28, 8, 0.18, false],
  [86, 520, 16, -28, 0.30, false],
  [350, 600, 64, 14, 0.10, true],
  [150, 660, 34, -6, 0.16, false],
  [40, 760, 20, 22, 0.26, false],
  [300, 770, 12, -15, 0.32, false],
  [210, 230, 9, 0, 0.30, false],
  [230, 520, 10, 40, 0.25, false],
];

function dropPath(size) {
  const s = size / 2;
  const f = (n) => (n * s).toFixed(2);
  return `M0,${f(-1)} C${f(0.62)},${f(-0.22)} ${f(0.78)},${f(0.18)} ${f(0.78)},${f(0.42)} `
    + `A${f(0.78)},${f(0.78)} 0 1,1 ${f(-0.78)},${f(0.42)} `
    + `C${f(-0.78)},${f(0.18)} ${f(-0.62)},${f(-0.22)} 0,${f(-1)} Z`;
}

const CoralBackdrop = React.memo(function CoralBackdrop({ style }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: T.background }, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 400 820" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <RadialGradient id="cg1" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={CORAL} stopOpacity="0.28" />
            <Stop offset="1" stopColor={CORAL} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="cg2" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#FF8A73" stopOpacity="0.18" />
            <Stop offset="1" stopColor="#FF8A73" stopOpacity="0" />
          </RadialGradient>
          {/* Shadowed edges: the middle stays lit, the corners fall into near-black. */}
          <RadialGradient id="vg" cx="0.5" cy="0.42" r="0.75">
            <Stop offset="0.35" stopColor="#0d080b" stopOpacity="0" />
            <Stop offset="0.8" stopColor="#0d080b" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#0d080b" stopOpacity="0.85" />
          </RadialGradient>
        </Defs>
        <Circle cx="360" cy="40" r="210" fill="url(#cg1)" />
        <Circle cx="-20" cy="470" r="230" fill="url(#cg2)" />
        <Circle cx="380" cy="800" r="220" fill="url(#cg1)" />
        {DROPS.map(([cx, cy, size, rot, op, outline], i) => (
          <Path
            key={i}
            d={dropPath(size)}
            transform={`translate(${cx} ${cy}) rotate(${rot})`}
            fill={outline ? 'none' : CORAL}
            fillOpacity={outline ? 0 : op}
            stroke={outline ? CORAL : 'none'}
            strokeWidth={outline ? 1.6 : 0}
            strokeOpacity={outline ? op : 0}
          />
        ))}
        <Rect x="-60" y="-60" width="520" height="940" fill="url(#vg)" />
      </Svg>
    </View>
  );
});

export default CoralBackdrop;

/** The coral "● ANONIXX" mark, as on the sign-in screen and the website. */
export function BrandMark({ style }) {
  return (
    <View style={[bm.row, style]} accessibilityRole="header" accessibilityLabel="Anonixx">
      <View style={bm.dot} />
      <Text style={bm.text}>ANONIXX</Text>
    </View>
  );
}

// A slim row holding the mark under the status bar. The screen below gets top inset 0, so its
// own SafeAreaView / insets don't add the status-bar space a second time.
function BrandRow({ children }) {
  const insets = useSafeAreaInsets();
  return (
    <>
      <View style={{ paddingTop: insets.top }}>
        <BrandMark />
      </View>
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </>
  );
}

const cache = new Map();

/** Wrap a screen so it sits on the coral backdrop (with the brand row unless brand: false).
 * Cached, so navigators get a stable component. */
export function withBackdrop(Screen, { brand = true } = {}) {
  const hit = cache.get(Screen)?.[brand ? 'b' : 'p'];
  if (hit) return hit;
  function WithBackdrop(props) {
    return (
      <View style={{ flex: 1, backgroundColor: T.background }}>
        <CoralBackdrop />
        {brand ? <BrandRow><Screen {...props} /></BrandRow> : <Screen {...props} />}
      </View>
    );
  }
  WithBackdrop.displayName = `WithBackdrop(${Screen.displayName || Screen.name || 'Screen'})`;
  cache.set(Screen, { ...(cache.get(Screen) || {}), [brand ? 'b' : 'p']: WithBackdrop });
  return WithBackdrop;
}

const bm = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: rp(8), paddingHorizontal: SPACING.md + rp(2), paddingTop: rp(4), height: rs(32) },
  dot: {
    width: rs(8), height: rs(8), borderRadius: rs(4), backgroundColor: T.primary,
    shadowColor: T.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: rs(6), elevation: 4,
  },
  text: { fontSize: rf(11), fontFamily: 'DMSans-Bold', color: T.primary, letterSpacing: rs(3), opacity: 0.85 },
});
