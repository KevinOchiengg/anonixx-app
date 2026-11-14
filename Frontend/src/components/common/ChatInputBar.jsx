/** Shared compose bar (text field, attach, emoji) for chat and comments. The caller passes
 * its own trailing button; SendButton is the common send state. */
import React from 'react';
import {
  View, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native';
import { ImagePlus, Paperclip, Send, Smile } from 'lucide-react-native';
import T from '../../utils/theme';
import {
  rs, rp, FONT, RADIUS, SPACING, HIT_SLOP,
} from '../../utils/responsive';

export default function ChatInputBar({
  inputRef, value, onChangeText, onFocus, onBlur, placeholder,
  editable = true, maxLength = 500,
  onAttachPress, attachUploading = false, attachDisabled = false,
  onEmojiPress, emojiActive = false,
  // Swaps out the text field entirely (e.g. a "recording…" row) without
  // the caller having to reimplement the pill around it.
  recordingContent,
  trailing,
  paddingBottom = 0,
  floating = false,   // chat: a frosted pill lifted off the bottom, no card behind it
}) {
  return (
    <View style={[styles.inputBar, floating && styles.inputBarFloating, { paddingBottom }]}>
      <View style={[styles.inputWrap, floating && styles.inputWrapFloating]}>
        {recordingContent ? recordingContent : (
          <>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={value}
              onChangeText={onChangeText}
              onFocus={onFocus}
              onBlur={onBlur}
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
                  : floating
                    ? <ImagePlus size={rs(21)} color={T.textSecondary} strokeWidth={2} />
                    : <Paperclip size={rs(21)} color={T.textMute} strokeWidth={2} />}
              </TouchableOpacity>
            )}
            {!!onEmojiPress && (
              <TouchableOpacity
                style={styles.emojiToggleBtn}
                onPress={onEmojiPress}
                hitSlop={HIT_SLOP}
                activeOpacity={0.75}
              >
                <Smile size={rs(23)} color={emojiActive ? T.primary : T.textMute} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
      {trailing}
    </View>
  );
}

/** Send button: coral circle, same size as VoiceNoteRecorder's filled mic. */
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
        : <Send size={rs(21)} color="#fff" strokeWidth={2} />}
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
  inputBarFloating: {
    backgroundColor: 'transparent', borderTopLeftRadius: 0, borderTopRightRadius: 0,
    shadowOpacity: 0, elevation: 0, paddingTop: rp(6), paddingHorizontal: rp(12), alignItems: 'flex-end',
  },
  inputWrapFloating: {
    backgroundColor: 'rgba(21,25,36,0.96)', borderColor: 'rgba(255,255,255,0.08)', borderRadius: rs(24),
    paddingHorizontal: rp(8), minHeight: rs(46),
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 8,
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
