/**
 * ChatInputBar.jsx
 *
 * Shared compose-bar shell — the pill (text field + attach + emoji) plus
 * the outer row that sits it next to a trailing action button. Used by
 * both Link Up chat (DropChatScreen) and the comment sheet
 * (CommentBottomSheet) so their composers stay visually identical without
 * hand-copying the same JSX and styles into every screen that needs one.
 *
 * What's deliberately NOT shared here: the trailing mic/send button's
 * behavior. Chat records voice notes with its own press-and-hold handlers
 * straight into screen state; comments delegate to VoiceNoteRecorder, a
 * self-contained component with its own slide-to-cancel gesture. Those are
 * genuinely different implementations, not just different styling — so the
 * caller passes its own button in as `trailing`. The `SendButton` below
 * covers the one trailing state that IS identical everywhere (typed text,
 * solid coral circle, Send icon) so screens don't re-style that either.
 */
import React from 'react';
import {
  View, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Paperclip, Send, Smile } from 'lucide-react-native';
import T from '../../utils/theme';
import {
  rs, rp, FONT, RADIUS, SPACING, HIT_SLOP,
} from '../../utils/responsive';

export default function ChatInputBar({
  inputRef, value, onChangeText, onFocus, placeholder,
  editable = true, maxLength = 500,
  onAttachPress, attachUploading = false, attachDisabled = false,
  onEmojiPress, emojiActive = false,
  // Swaps out the text field entirely (e.g. a "recording…" row) without
  // the caller having to reimplement the pill around it.
  recordingContent,
  trailing,
  paddingBottom = 0,
}) {
  return (
    <View style={[styles.inputBar, { paddingBottom }]}>
      <View style={styles.inputWrap}>
        {recordingContent ? recordingContent : (
          <>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={value}
              onChangeText={onChangeText}
              onFocus={onFocus}
              placeholder={placeholder}
              placeholderTextColor={T.textMute}
              multiline
              maxLength={maxLength}
              editable={editable}
            />
            {!!onAttachPress && (
              <TouchableOpacity
                style={styles.mediaBtn}
                onPress={onAttachPress}
                disabled={attachDisabled || attachUploading}
                hitSlop={HIT_SLOP}
                activeOpacity={0.75}
              >
                {attachUploading
                  ? <ActivityIndicator size="small" color={T.primary} />
                  : <Paperclip size={rs(21)} color={T.textMute} strokeWidth={1.8} />}
              </TouchableOpacity>
            )}
            {!!onEmojiPress && (
              <TouchableOpacity
                style={styles.emojiToggleBtn}
                onPress={onEmojiPress}
                hitSlop={HIT_SLOP}
                activeOpacity={0.75}
              >
                <Smile size={rs(23)} color={emojiActive ? T.primary : T.textMute} strokeWidth={1.8} />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
      {trailing}
    </View>
  );
}

/** The one trailing-button state that's identical everywhere: typed text,
 * solid coral circle, Send icon. Sized to match VoiceNoteRecorder's
 * `filled` mic variant exactly, so nothing changes size mid-morph. */
export function SendButton({ onPress, sending = false, disabled = false }) {
  return (
    <TouchableOpacity
      style={styles.sendBtn}
      onPress={onPress}
      disabled={sending || disabled}
      hitSlop={HIT_SLOP}
      activeOpacity={0.85}
    >
      {sending
        ? <ActivityIndicator size="small" color="#fff" />
        : <Send size={rs(21)} color="#fff" strokeWidth={2.2} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Floating rounded-top card, not a flat bordered strip — lifts the
  // composer visually off whatever list sits above it (messages, comments).
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: rp(10),
    paddingHorizontal: SPACING.md, paddingTop: rp(12),
    backgroundColor: T.surface,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 12,
  },
  // The pill holds text/attach/emoji as flex siblings — the send/mic
  // button lives outside it (see `trailing`/SendButton above).
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: T.surfaceDark, borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: T.border, paddingHorizontal: rp(4),
  },
  input: {
    flex: 1, paddingHorizontal: rp(4), paddingVertical: rp(10),
    fontFamily: 'DMSans-Regular', fontSize: FONT.md, color: T.text,
    maxHeight: rs(100),
  },
  mediaBtn: { width: rs(34), height: rs(42), alignItems: 'center', justifyContent: 'center' },
  emojiToggleBtn: { width: rs(36), height: rs(42), alignItems: 'center', justifyContent: 'center' },
  sendBtn: {
    width: rs(44), height: rs(44), borderRadius: rs(22),
    backgroundColor: T.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: T.primary, shadowOpacity: 0.35, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
});
