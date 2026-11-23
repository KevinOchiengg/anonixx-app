import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackActions } from '@react-navigation/native';
import { Phone, Video } from 'lucide-react-native';
import { activeCall } from '../../utils/activeCall';
import { rs, rf, rp } from '../../utils/responsive';
import T from '../../utils/theme';

function clock(from) {
  const secs = Math.max(0, Math.floor((Date.now() - from) / 1000));
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  return `${m}:${String(secs % 60).padStart(2, '0')}`;
}

/** "Tap to return to call": shows over every screen while a call is minimised. */
export default function CallReturnBar({ navigationRef }) {
  const insets = useSafeAreaInsets();
  const [call, setCall] = useState(activeCall.get());
  const [route, setRoute] = useState(null);
  const [, tick] = useState(0);

  useEffect(() => activeCall.subscribe(setCall), []);
  useEffect(() => {
    const update = () => setRoute(navigationRef.getCurrentRoute()?.name || null);
    update();
    return navigationRef.addListener('state', update);
  }, [navigationRef]);
  useEffect(() => {
    if (!call?.startedAt) return undefined;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [call?.startedAt]);

  if (!call || route === 'DropCall') return null;
  const Icon = call.video ? Video : Phone;
  return (
    <TouchableOpacity
      style={[styles.bar, { paddingTop: insets.top + rp(6) }]}
      onPress={() => navigationRef.dispatch(StackActions.popTo('DropCall'))}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Return to call"
    >
      <Icon size={rs(15)} color="#fff" />
      <Text style={styles.text} numberOfLines={1}>
        Tap to return to call{call.name ? ` · ${call.name}` : ''}{call.startedAt ? ` · ${clock(call.startedAt)}` : ''}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, elevation: 50,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(8),
    paddingBottom: rp(8), backgroundColor: T.success,
  },
  text: { fontFamily: 'DMSans-SemiBold', fontSize: rf(13), color: '#fff' },
});
