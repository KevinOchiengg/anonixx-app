/**
 * DropScreenHeader.jsx
 *
 * Shared header used across every Drops / Connect surface.
 * Matches the reference pattern in DropsComposeScreen lines 562–573.
 *
 * Layout:
 *   [ back-chevron ]   [ Italic title ]   [ right action ]
 *
 * Usage:
 *   <DropScreenHeader title="Marketplace" navigation={navigation} />
 *
 *   <DropScreenHeader
 *     title="Drop"
 *     navigation={navigation}
 *     rightLabel="Inbox"
 *     onRightPress={() => navigation.navigate('DropsInbox')}
 *   />
 *
 *   <DropScreenHeader
 *     title="Vibe"
 *     navigation={navigation}
 *     right={<SomeIconButton />}
 *   />
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';

import { T } from '../../utils/colorTokens';
import {
  rs, FONT, SPACING, HIT_SLOP,
} from '../../utils/responsive';

function DropScreenHeader({
  title,
  navigation,
  onBack,
  hideBack     = false,
  rightLabel   = null,
  onRightPress = null,
  right        = null,   // custom right-side node (takes precedence over rightLabel)
}) {
  const handleBack = () => {
    if (onBack) return onBack();
    navigation?.goBack?.();
  };

  return (
    <View style={styles.header}>
      {/* Left — back */}
      {hideBack ? (
        <View style={styles.sideSlot} />
      ) : (
        <TouchableOpacity
          onPress={handleBack}
          hitSlop={HIT_SLOP}
          style={styles.sideSlot}
          activeOpacity={0.7}
        >
          <ChevronLeft size={rs(24)} color={T.text} />
        </TouchableOpacity>
      )}

      {/* Centre — italic title */}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      {/* Right — custom node, label, or empty spacer */}
      <View style={styles.sideSlot}>
        {right
          ? right
          : rightLabel
            ? (
              <TouchableOpacity
                onPress={onRightPress}
                hitSlop={HIT_SLOP}
                activeOpacity={0.7}
              >
                <Text style={styles.actionText}>{rightLabel}</Text>
              </TouchableOpacity>
            )
            : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    backgroundColor:   T.background,
  },
  sideSlot: {
    minWidth:     rs(32),
    alignItems:   'flex-start',
    justifyContent: 'center',
  },
  title: {
    flex:          1,
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.lg,
    color:         T.text,
    letterSpacing: 0.5,
    textAlign:     'center',
  },
  actionText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         T.primary,
    letterSpacing: 0.3,
    textAlign:     'right',
  },
});

export default React.memo(DropScreenHeader);
