/** Long-press menu for a feed post (it replaced the ⋯ on the rail): 2x speed on videos,
 * save, share, and Report or block on other people's posts. */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bookmark, FastForward, Flag, Share2 } from 'lucide-react-native';
import { THEME } from '../../utils/theme';

function Row({ icon, label, danger, onPress }) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7}>
      {icon}
      <Text style={[s.rowText, danger && { color: THEME.danger }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function PostMenuSheet({ menu, saved, onClose, onSave, onShare, onReport }) {
  const insets = useSafeAreaInsets();
  const post = menu?.post;
  const canReport = !!post && !post.is_own_post && !post.is_admin_drop;
  // Run the action after the sheet closes, so a following sheet or dialog can open.
  const pick = (fn) => () => { onClose(); setTimeout(fn, 250); };

  return (
    <Modal visible={!!post} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: 12 + insets.bottom }]} onPress={() => {}}>
          <View style={s.handle} />
          {menu?.toggleSpeed && (
            <Row
              icon={<FastForward size={20} color={THEME.text} />}
              label={menu.fast ? 'Normal speed' : 'Play at 2x'}
              onPress={() => { menu.toggleSpeed(); onClose(); }}
            />
          )}
          <Row
            icon={<Bookmark size={20} color={saved ? THEME.primary : THEME.text} fill={saved ? THEME.primary : 'none'} />}
            label={saved ? 'Saved' : 'Save'}
            onPress={() => { onSave(post); onClose(); }}
          />
          <Row icon={<Share2 size={20} color={THEME.text} />} label="Share" onPress={pick(() => onShare(post))} />
          {canReport && (
            <Row icon={<Flag size={20} color={THEME.danger} />} label="Report or block" danger onPress={pick(() => onReport(post))} />
          )}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 10 },
  rowText: { color: THEME.text, fontSize: 16, fontFamily: 'DMSans-SemiBold' },
  cancel: { marginTop: 6, paddingVertical: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: THEME.border },
  cancelText: { color: THEME.textSecondary, fontSize: 15, fontFamily: 'DMSans-SemiBold' },
});
