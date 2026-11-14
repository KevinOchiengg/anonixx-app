/** Bottom sheets for a Room chat.
 *  ChatMenuSheet: the ⋮ menu (Mute, Clear chat, Report, Block). Mute and Report open their
 *    choices inside the same sheet, so every option shows on Android too.
 *  MessageSheet: long-press on a message (reactions, Reply, Copy, Delete). */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, BellOff, ChevronLeft, Copy, Eraser, Flag, Reply, ShieldOff, Trash2 } from 'lucide-react-native';
import { T } from '../../utils/colorTokens';
import { rs, rf, rp, HIT_SLOP } from '../../utils/responsive';
import { MUTE_OPTIONS } from '../../services/chats';
import { REPORT_REASONS, mutedLabel } from '../../services/roomActions';
import { REACTIONS } from './ChatBubble';

const DANGER = T.error || '#E85D5D';

function Sheet({ visible, onClose, children }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + rp(8) }]}>
          <View style={s.handle} />
          {children}
          <TouchableOpacity style={s.cancel} onPress={onClose} hitSlop={HIT_SLOP}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({ Icon, label, danger, onPress }) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7}>
      {Icon ? (
        <View style={s.tile}><Icon size={rs(18)} color={danger ? DANGER : T.primary} strokeWidth={2} /></View>
      ) : null}
      <Text style={[s.rowText, danger && { color: DANGER }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SubHead({ title, onBack }) {
  return (
    <TouchableOpacity style={s.subHead} onPress={onBack} hitSlop={HIT_SLOP} accessibilityLabel="Back">
      <ChevronLeft size={rs(20)} color={T.text} strokeWidth={2} />
      <Text style={s.subTitle}>{title}</Text>
    </TouchableOpacity>
  );
}

export function ChatMenuSheet({ visible, onClose, name, isGuest, mutedUntil, onMute, onClear, onReport, onReportFake, onBlock }) {
  const [view, setView] = useState('menu');
  useEffect(() => { if (visible) setView('menu'); }, [visible]);

  return (
    <Sheet visible={visible} onClose={onClose}>
      {view === 'menu' ? (
        <>
          <Row
            Icon={BellOff}
            label={mutedUntil ? `Unmute (${mutedLabel(mutedUntil).toLowerCase()})` : 'Mute'}
            onPress={() => (mutedUntil ? onMute('off') : setView('mute'))}
          />
          <Row Icon={Eraser} label="Clear chat" onPress={onClear} />
          <Row Icon={Flag} label="Report" danger onPress={() => setView('report')} />
          <Row Icon={ShieldOff} label={`Block ${name}`} danger onPress={onBlock} />
        </>
      ) : view === 'mute' ? (
        <>
          <SubHead title="Mute for" onBack={() => setView('menu')} />
          {MUTE_OPTIONS.map(([v, label]) => <Row key={v} label={label} onPress={() => onMute(v)} />)}
        </>
      ) : (
        <>
          <SubHead title={`What's wrong with ${name}?`} onBack={() => setView('menu')} />
          {isGuest ? <Row Icon={AlertTriangle} label="Their confession was fake" danger onPress={onReportFake} /> : null}
          {REPORT_REASONS.map(([id, label]) => <Row key={id} label={label} onPress={() => onReport(id)} />)}
        </>
      )}
    </Sheet>
  );
}

export function MessageSheet({ item, onClose, onReact, onReply, onCopy, onDelete }) {
  return (
    <Sheet visible={!!item} onClose={onClose}>
      <View style={s.reactions}>
        {REACTIONS.map((e) => {
          const mine = item?.reactions?.some((r) => r.mine && r.emoji === e);
          return (
            <TouchableOpacity key={e} style={[s.reactionBtn, mine && s.reactionBtnMine]} onPress={() => item && onReact(item, e)} hitSlop={HIT_SLOP}>
              <Text style={s.reactionEmoji}>{e}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Row Icon={Reply} label="Reply" onPress={() => onReply(item)} />
      {item?.content ? <Row Icon={Copy} label="Copy" onPress={() => onCopy(item)} /> : null}
      <Row Icon={Trash2} label="Delete" danger onPress={() => onDelete(item)} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: T.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: rp(12), paddingTop: rp(8), borderWidth: 1, borderColor: T.border,
  },
  handle: { alignSelf: 'center', width: rs(40), height: rs(4), borderRadius: 2, backgroundColor: T.border, marginBottom: rp(8) },
  row: { flexDirection: 'row', alignItems: 'center', gap: rp(14), paddingVertical: rp(10), paddingHorizontal: rp(10), minHeight: rs(52) },
  tile: { width: rs(36), height: rs(36), borderRadius: rs(10), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,99,74,0.12)' },
  rowText: { color: T.text, fontSize: rf(16), fontFamily: 'DMSans-SemiBold' },
  subHead: { flexDirection: 'row', alignItems: 'center', gap: rp(6), paddingVertical: rp(8), paddingHorizontal: rp(6) },
  subTitle: { color: T.text, fontSize: rf(15), fontFamily: 'DMSans-Bold' },
  reactions: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: rp(8), paddingHorizontal: rp(6) },
  reactionBtn: { width: rs(44), height: rs(44), borderRadius: rs(22), alignItems: 'center', justifyContent: 'center', backgroundColor: T.surfaceAlt },
  reactionBtnMine: { backgroundColor: T.primaryDim, borderWidth: 1, borderColor: T.primaryBorder },
  reactionEmoji: { fontSize: rf(22) },
  cancel: { marginTop: rp(6), paddingVertical: rp(14), alignItems: 'center', borderTopWidth: 1, borderTopColor: T.border },
  cancelText: { color: T.textSec, fontSize: rf(15), fontFamily: 'DMSans-SemiBold' },
});
