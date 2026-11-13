/** Long-press menu for a feed post: speed (videos), clear display, save, share, copy link,
 * not interested, and Report or block on other people's posts. */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bookmark, EyeOff, Flag, Gauge, Link2, Maximize, Share2 } from 'lucide-react-native';
import { THEME } from '../../utils/theme';

const SPEEDS = [0.5, 1, 1.5, 2];

function Tile({ children }) {
  return <View style={s.tile}>{children}</View>;
}

function Row({ icon, label, danger, onPress }) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7}>
      <Tile>{icon}</Tile>
      <Text style={[s.rowText, danger && { color: THEME.danger }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function PostMenuSheet({
  menu, saved, onClose, onSave, onShare, onCopyLink, onClear, onNotInterested, onReport,
}) {
  const insets = useSafeAreaInsets();
  const post = menu?.post;
  const others = !!post && !post.is_own_post && !post.is_admin_drop;
  // Run the action after the sheet closes, so a following sheet or dialog can open.
  const pick = (fn) => () => { onClose(); setTimeout(fn, 250); };

  return (
    <Modal visible={!!post} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: 12 + insets.bottom }]} onPress={() => {}}>
          <View style={s.handle} />

          {menu?.onSpeed && (
            <View style={s.speedRow}>
              <Tile><Gauge size={20} color={THEME.primary} /></Tile>
              <Text style={s.rowText}>Speed</Text>
              <View style={s.chips}>
                {SPEEDS.map((v) => {
                  const on = menu.speed === v;
                  return (
                    <TouchableOpacity
                      key={v}
                      style={[s.chip, on && s.chipOn]}
                      onPress={() => { menu.onSpeed(v); onClose(); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.chipText, on && s.chipTextOn]}>{v}x</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <Row
            icon={<Bookmark size={20} color={THEME.primary} fill={saved ? THEME.primary : 'none'} />}
            label={saved ? 'Saved' : 'Save'}
            onPress={() => { onSave(post); onClose(); }}
          />
          <Row icon={<Share2 size={20} color={THEME.primary} />} label="Share" onPress={pick(() => onShare(post))} />
          <Row icon={<Link2 size={20} color={THEME.primary} />} label="Copy link" onPress={() => { onCopyLink(post); onClose(); }} />
          <Row icon={<Maximize size={20} color={THEME.primary} />} label="Clear display" onPress={() => { onClear(); onClose(); }} />
          {others && (
            <Row icon={<EyeOff size={20} color={THEME.primary} />} label="Not interested" onPress={() => { onNotInterested(post); onClose(); }} />
          )}
          {others && (
            <Row icon={<Flag size={20} color={THEME.danger} />} label="Report or block" danger onPress={pick(() => onReport(post))} />
          )}

          {menu?.onSpeed && <Text style={s.tip}>Hold either edge for 2x.</Text>}

          <TouchableOpacity style={s.cancel} onPress={onClose} activeOpacity={0.7}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: THEME.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 12, paddingTop: 8, borderWidth: 1, borderColor: THEME.border,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: THEME.borderStrong, marginBottom: 8 },
  tile: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,99,74,0.12)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 10 },
  rowText: { color: THEME.text, fontSize: 16, fontFamily: 'DMSans-SemiBold' },
  speedRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 10 },
  chips: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: THEME.border, backgroundColor: THEME.surfaceAlt,
  },
  chipOn: { backgroundColor: THEME.primary, borderColor: THEME.primary },
  chipText: { color: THEME.textSecondary, fontSize: 13, fontFamily: 'DMSans-SemiBold' },
  chipTextOn: { color: '#fff' },
  tip: { color: THEME.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 2 },
  cancel: { marginTop: 6, paddingVertical: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: THEME.border },
  cancelText: { color: THEME.textSecondary, fontSize: 15, fontFamily: 'DMSans-SemiBold' },
});
