/**
 * ChipRow.jsx
 *
 * Shared chip / pill vocabulary for Drops + Connect surfaces.
 * Matches the reference in DropsComposeScreen (FormatChip, MoodChip,
 * intensityBtn, audienceBtn).
 *
 * Exports:
 *   <Chip variant="pill|card|wide" label="..." active onPress={...} />
 *   <ChipRow scroll={false} gap="sm">{children}</ChipRow>
 *
 * Variants:
 *   pill  — small rounded pill, optional icon. Used for moods, tags, filters.
 *   card  — big tile, centred label + italic sub. Used for intensity picker.
 *   wide  — horizontal row: icon + label + description. Used for audience.
 */
import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';

import { T } from '../../utils/colorTokens';
import {
  rp, rs, rf, FONT, RADIUS, SPACING, HIT_SLOP,
} from '../../utils/responsive';

// ─── Chip ──────────────────────────────────────────────────────
function Chip({
  variant = 'pill',
  label,
  sub,
  Icon,
  active = false,
  disabled = false,
  onPress,
  style,
  accent,              // optional override colour (for tier-2 themes etc.)
}) {
  const accentBorder = accent ? `${accent}66` : T.primaryBorder; // 40% alpha
  const accentBg     = accent ? `${accent}14` : T.primaryDim;    // ~8% alpha
  const accentText   = accent || T.primary;

  if (variant === 'card') {
    return (
      <TouchableOpacity
        style={[
          s.card,
          active && { borderColor: accentBorder, backgroundColor: accentBg },
          disabled && s.disabled,
          style,
        ]}
        onPress={disabled ? undefined : onPress}
        activeOpacity={0.85}
        hitSlop={HIT_SLOP}
        disabled={disabled}
      >
        <Text
          style={[
            s.cardLabel,
            active && { color: accentText },
          ]}
        >
          {label}
        </Text>
        {sub ? <Text style={s.cardSub}>{sub}</Text> : null}
      </TouchableOpacity>
    );
  }

  if (variant === 'wide') {
    return (
      <TouchableOpacity
        style={[
          s.wide,
          active && { borderColor: accentBorder, backgroundColor: accentBg },
          disabled && s.disabled,
          style,
        ]}
        onPress={disabled ? undefined : onPress}
        activeOpacity={0.85}
        hitSlop={HIT_SLOP}
        disabled={disabled}
      >
        {Icon ? (
          <Icon
            size={rs(18)}
            color={active ? accentText : T.textSec}
            strokeWidth={2}
          />
        ) : null}
        <View style={{ flex: 1 }}>
          <Text
            style={[
              s.wideLabel,
              active && { color: accentText },
            ]}
          >
            {label}
          </Text>
          {sub ? <Text style={s.wideSub}>{sub}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  }

  // pill (default)
  return (
    <TouchableOpacity
      style={[
        s.pill,
        active && { borderColor: accentBorder, backgroundColor: accentBg },
        disabled && s.disabled,
        style,
      ]}
      onPress={disabled ? undefined : onPress}
      activeOpacity={0.85}
      hitSlop={HIT_SLOP}
      disabled={disabled}
    >
      {Icon ? (
        <Icon
          size={rs(14)}
          color={active ? accentText : T.textSec}
          strokeWidth={2}
        />
      ) : null}
      <Text
        style={[
          s.pillText,
          active && { color: accentText },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── ChipRow ──────────────────────────────────────────────────
// Container for laying out chips horizontally. If `scroll` is true,
// renders inside a ScrollView so the row can extend beyond the screen.
function ChipRow({
  children,
  scroll    = false,
  gap       = 'sm',      // 'xs' | 'sm' | 'md'
  style,
  contentStyle,
}) {
  const gapPx =
    gap === 'xs' ? SPACING.xs :
    gap === 'md' ? SPACING.md :
    SPACING.sm;

  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={style}
        contentContainerStyle={[{ gap: gapPx, paddingRight: SPACING.md }, contentStyle]}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View
      style={[
        { flexDirection: 'row', gap: gapPx, flexWrap: 'wrap' },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  // pill (moods, tags, filters)
  pill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(6),
    paddingHorizontal: rp(14),
    paddingVertical:   rp(7),
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    borderColor:       T.border,
    backgroundColor:   'rgba(255,255,255,0.02)',
  },
  pillText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(11),
    color:         T.textSec,
    letterSpacing: 1.2,
  },

  // card (intensity — large stacked tile)
  card: {
    flex:              1,
    paddingHorizontal: rp(10),
    paddingVertical:   rp(12),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
    backgroundColor:   'transparent',
    alignItems:        'center',
  },
  cardLabel: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(14),
    color:         T.textSec,
    letterSpacing: 0.3,
  },
  cardSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(10),
    color:         T.textMute,
    letterSpacing: 0.3,
    marginTop:     rp(4),
    textAlign:     'center',
  },

  // wide (audience — horizontal row with icon + stacked text)
  wide: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(10),
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
    backgroundColor:   'transparent',
  },
  wideLabel: {
    fontFamily:   'DMSans-Bold',
    fontSize:     FONT.sm,
    color:        T.textSec,
    marginBottom: rp(2),
    letterSpacing: 0.3,
  },
  wideSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textMute,
    letterSpacing: 0.3,
  },

  disabled: { opacity: 0.4 },
});

const ChipMemo    = React.memo(Chip);
const ChipRowMemo = React.memo(ChipRow);

export { ChipMemo as Chip, ChipRowMemo as ChipRow };
export default ChipMemo;
