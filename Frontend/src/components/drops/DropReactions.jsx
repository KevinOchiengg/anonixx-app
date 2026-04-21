/**
 * DropReactions.jsx
 *
 * Emotional signal reactions — not emoji.
 * Per spec (section 8): "Replace emoji reactions with emotional signal reactions.
 * Sender receives the reaction text — not an emoji. Something to interpret.
 * Something to sit with."
 *
 * Six options:
 *   "That hit me."
 *   "I think I know who this is."
 *   "This feels like you."
 *   "I'm not ready to respond."
 *   "Say more."
 *   "I needed to read this."
 *
 * Behavior:
 *   - One reaction per user per drop (optimistic single-select).
 *   - Tapping a different one replaces. Tapping the sent one removes it.
 *   - Once sent, the others fade — the sent line glows in theme accent and
 *     reads "— you sent this" beneath it.
 *   - No counts. The sender gets the text; viewers don't see other viewers'
 *     reactions (keeps the intimate quality the spec describes).
 *
 * Backend-facing:
 *   POST   /api/v1/drops/:id/react   { reaction: "That hit me." }
 *   DELETE /api/v1/drops/:id/react
 */
import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { rs, rf, rp, HIT_SLOP } from '../../utils/responsive';
import { API_BASE_URL } from '../../config/api';

// ─── Reaction set (spec-exact text, do not paraphrase) ─────────
export const REACTIONS = [
  'That hit me.',
  'I think I know who this is.',
  'This feels like you.',
  "I'm not ready to respond.",
  'Say more.',
  'I needed to read this.',
];

// ─── Single reaction line ──────────────────────────────────────
const ReactionLine = React.memo(function ReactionLine({
  text, active, dimmed, accent, onPress,
}) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue:       dimmed ? 0.28 : 1,
      duration:      260,
      useNativeDriver: true,
    }).start();
  }, [dimmed, opacity]);

  return (
    <Animated.View style={{ opacity }}>
      <TouchableOpacity
        style={[
          styles.line,
          active && { borderColor: accent, backgroundColor: accent + '12' },
        ]}
        onPress={onPress}
        hitSlop={HIT_SLOP}
        activeOpacity={0.8}
        disabled={dimmed}
      >
        <Text style={[
          styles.lineText,
          active && { color: accent, fontFamily: 'PlayfairDisplay-Italic' },
        ]}>
          {text}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Main component ────────────────────────────────────────────
const DropReactions = React.memo(function DropReactions({
  dropId,
  initialReaction = null,           // null or one of REACTIONS
  accent          = '#FF634A',      // theme accent
  onReact         = null,           // optional callback(reactionText | null)
  disabled        = false,
  label           = 'What does this say to you?',
}) {
  const [userReaction, setUserReaction] = useState(initialReaction);

  useEffect(() => { setUserReaction(initialReaction); }, [initialReaction]);

  const sendReaction = useCallback(async (nextText) => {
    if (!dropId) return;
    try {
      const token = await AsyncStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      if (nextText) {
        await fetch(`${API_BASE_URL}/api/v1/drops/${dropId}/react`, {
          method: 'POST', headers, body: JSON.stringify({ reaction: nextText }),
        });
      } else {
        await fetch(`${API_BASE_URL}/api/v1/drops/${dropId}/react`, {
          method: 'DELETE', headers,
        });
      }
    } catch {
      // Silent — optimistic UI stays accurate even if endpoint is absent.
    }
  }, [dropId]);

  const handleSelect = useCallback((reactionText) => {
    if (disabled) return;
    const next = userReaction === reactionText ? null : reactionText;
    setUserReaction(next);
    onReact?.(next);
    sendReaction(next);
  }, [disabled, userReaction, onReact, sendReaction]);

  // Once sent, render a quiet confirmation plus the option to change.
  if (userReaction) {
    return (
      <View style={styles.sentWrap}>
        <Text style={[styles.sentQuote, { color: accent }]}>
          "{userReaction}"
        </Text>
        <Text style={styles.sentFooter}>— you sent this</Text>
        <TouchableOpacity
          onPress={() => handleSelect(userReaction)}   // toggles off
          hitSlop={HIT_SLOP}
          style={styles.undoBtn}
        >
          <Text style={[styles.undoText, { color: accent }]}>
            take it back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={styles.promptLabel}>{label}</Text>
      ) : null}
      {REACTIONS.map((text) => (
        <ReactionLine
          key={text}
          text={text}
          active={false}
          dimmed={disabled}
          accent={accent}
          onPress={() => handleSelect(text)}
        />
      ))}
    </View>
  );
});

// ─── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrap: {
    gap:               rp(6),
    paddingHorizontal: rp(4),
    paddingVertical:   rp(8),
  },
  promptLabel: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         '#9A9AA3',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom:  rp(4),
  },
  line: {
    paddingHorizontal: rp(14),
    paddingVertical:   rp(11),
    borderRadius:      rs(14),
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.08)',
    backgroundColor:   'rgba(255,255,255,0.02)',
  },
  lineText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(14),
    color:         '#EAEAF0',
    letterSpacing: 0.3,
    lineHeight:    rf(22),
  },

  // Sent state
  sentWrap: {
    alignItems:        'center',
    paddingHorizontal: rp(16),
    paddingVertical:   rp(14),
  },
  sentQuote: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(18),
    letterSpacing: 0.3,
    textAlign:     'center',
    lineHeight:    rf(26),
  },
  sentFooter: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(10),
    color:         '#6a6f82',
    letterSpacing: 2,
    marginTop:     rp(8),
    textTransform: 'uppercase',
  },
  undoBtn: {
    marginTop:       rp(12),
    paddingVertical: rp(6),
  },
  undoText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(11),
    letterSpacing: 0.5,
  },
});

export default DropReactions;
