/** The Anonixx backdrop: the original dark base with soft coral glows, coral star splashes
 * (raw truth spilling out) and softly shadowed edges.
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

// [path, opacity, outline, specks [[cx, cy, r]]] in a 400 x 820 canvas (generated; same shapes as Web/public/bg-drops.svg).
const SPLASHES = [
  ["M363.3,85.9 Q341.9,86.9 355.5,110.4 Q334.5,92.5 330.0,117.6 Q324.8,94.2 311.3,102.2 Q316.1,88.0 301.8,85.0 Q314.7,77.3 304.7,65.4 Q321.4,69.7 317.8,46.5 Q330.0,61.9 340.3,51.6 Q339.1,69.1 364.0,60.4 Q348.6,76.7 363.3,85.9Z", 0.3, false, [[276.6, 51.9, 3.9], [399.2, 100.9, 2.3], [362.7, 121.8, 2.3]]],
  ["M80.1,162.7 Q66.9,170.7 76.4,180.0 Q64.6,177.1 62.2,187.2 Q57.4,177.7 49.8,180.4 Q53.8,172.3 44.2,168.4 Q52.7,165.5 50.3,155.0 Q59.1,162.7 66.1,151.7 Q65.5,164.4 80.1,162.7Z", 0.26, false, [[49.1, 203.6, 1.6], [61.2, 202.4, 1.4]]],
  ["M368.3,307.1 Q359.5,304.5 358.8,310.4 Q355.2,306.1 351.1,308.5 Q352.0,303.1 342.9,303.5 Q351.6,299.4 345.6,294.0 Q353.4,296.6 352.6,287.4 Q356.8,294.3 362.2,289.2 Q360.7,296.4 366.6,297.2 Q361.6,300.7 368.3,307.1Z", 0.38, false, [[338.5, 288.2, 0.9], [369.0, 279.5, 0.9]]],
  ["M97.9,360.0 Q66.4,364.7 89.8,387.5 Q63.5,375.8 68.3,410.2 Q52.0,380.8 40.2,396.2 Q41.7,374.2 14.8,387.1 Q37.8,364.6 10.2,360.0 Q36.8,355.1 24.0,339.6 Q43.1,347.7 37.1,314.3 Q52.0,344.3 63.5,324.5 Q62.3,345.8 92.6,330.5 Q66.6,355.3 97.9,360.0Z", 0.17, true, []],
  ["M316.9,455.6 Q303.8,456.0 309.2,472.8 Q297.4,460.7 289.2,475.2 Q290.7,456.9 277.6,460.6 Q287.0,451.2 270.5,443.2 Q287.0,443.1 286.8,434.0 Q294.9,441.7 301.0,431.4 Q301.2,443.2 315.1,439.0 Q305.9,448.7 316.9,455.6Z", 0.22, false, [[293.6, 480.0, 1.6], [269.5, 478.4, 2.3], [282.1, 414.6, 1.8]]],
  ["M106.9,557.9 Q96.7,561.5 104.0,571.4 Q94.4,566.2 90.6,576.3 Q88.6,565.8 81.1,567.3 Q86.3,560.8 81.3,556.6 Q87.4,555.7 88.1,549.8 Q92.4,555.1 98.1,549.7 Q96.3,557.1 106.9,557.9Z", 0.34, false, [[81.7, 576.3, 0.6], [103.5, 576.1, 0.9]]],
  ["M374.3,633.9 Q358.8,634.8 369.3,661.4 Q345.8,636.9 341.9,662.3 Q335.3,639.0 317.4,658.8 Q327.2,632.1 289.9,645.6 Q315.5,624.6 292.9,615.4 Q320.8,612.3 309.9,596.2 Q329.9,605.7 325.6,578.0 Q339.2,601.2 353.3,565.8 Q349.0,604.5 366.8,594.6 Q361.9,608.8 387.9,610.9 Q357.8,621.8 374.3,633.9Z", 0.12, true, []],
  ["M187.4,682.7 Q169.7,690.8 185.5,701.9 Q170.1,700.1 173.8,719.6 Q161.1,702.9 153.7,713.7 Q153.5,699.3 141.0,703.3 Q147.1,693.4 131.9,687.5 Q147.9,684.4 142.0,672.0 Q155.5,680.3 157.2,658.2 Q163.7,676.2 178.6,663.4 Q171.0,682.3 187.4,682.7Z", 0.19, false, [[181.6, 642.8, 1.6], [115.8, 685.1, 1.3], [202.3, 697.5, 1.7]]],
  ["M66.1,771.6 Q55.6,773.9 58.4,782.4 Q50.5,778.1 46.2,790.5 Q44.1,777.5 36.1,780.0 Q41.9,771.9 33.6,768.7 Q42.4,767.1 38.8,759.1 Q45.7,762.8 49.7,750.2 Q51.8,762.7 60.6,759.4 Q55.3,767.7 66.1,771.6Z", 0.29, false, [[55.2, 747.6, 1.4], [74.7, 753.0, 1.5]]],
  ["M307.7,786.5 Q301.6,783.5 299.7,791.6 Q298.1,783.7 290.7,787.0 Q294.9,781.0 290.6,777.6 Q296.8,777.3 294.9,768.7 Q300.1,775.2 303.9,772.4 Q303.0,777.7 308.3,778.3 Q305.0,781.3 307.7,786.5Z", 0.36, false, [[305.1, 766.1, 1.0], [318.3, 777.7, 0.7]]],
  ["M217.6,240.0 Q212.4,241.4 212.8,244.9 Q210.0,243.8 206.0,246.9 Q207.2,241.6 201.0,240.0 Q207.3,238.4 205.6,232.4 Q210.0,236.4 213.2,234.5 Q212.5,238.6 217.6,240.0Z", 0.36, false, [[207.0, 250.8, 0.6], [209.3, 252.2, 0.4]]],
  ["M241.4,543.4 Q234.2,542.6 233.4,548.0 Q230.7,543.5 224.4,546.4 Q228.6,540.6 222.6,536.6 Q229.7,537.2 230.5,531.7 Q233.2,536.6 236.9,535.9 Q235.5,539.4 241.4,543.4Z", 0.29, false, [[236.6, 550.3, 0.8], [238.6, 552.4, 0.8]]],
];

const CoralBackdrop = React.memo(function CoralBackdrop({ style }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: T.background }, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 400 820" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <RadialGradient id="cg1" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={CORAL} stopOpacity="0.2" />
            <Stop offset="1" stopColor={CORAL} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="cg2" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#FF8A73" stopOpacity="0.12" />
            <Stop offset="1" stopColor="#FF8A73" stopOpacity="0" />
          </RadialGradient>
          {/* Shadowed edges: the middle stays lit, the corners fall into shadow. */}
          <RadialGradient id="vg" cx="0.5" cy="0.42" r="0.75">
            <Stop offset="0.4" stopColor="#000" stopOpacity="0" />
            <Stop offset="1" stopColor="#000" stopOpacity="0.5" />
          </RadialGradient>
        </Defs>
        <Circle cx="360" cy="40" r="210" fill="url(#cg1)" />
        <Circle cx="-20" cy="470" r="230" fill="url(#cg2)" />
        <Circle cx="380" cy="800" r="220" fill="url(#cg1)" />
        {SPLASHES.map(([d, op, outline, specks], i) => (
          <React.Fragment key={i}>
            <Path
              d={d}
              fill={outline ? 'none' : CORAL}
              fillOpacity={outline ? 0 : op}
              stroke={outline ? CORAL : 'none'}
              strokeWidth={outline ? 1.6 : 0}
              strokeOpacity={outline ? op : 0}
              strokeLinejoin="round"
            />
            {specks.map(([x, y, r], j) => <Circle key={j} cx={x} cy={y} r={r} fill={CORAL} fillOpacity={op} />)}
          </React.Fragment>
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
