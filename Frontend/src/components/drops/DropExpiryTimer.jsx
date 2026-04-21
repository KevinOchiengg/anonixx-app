/**
 * DropExpiryTimer.jsx
 *
 * Ghost countdown — 72-hour expiry that's part of the Drop's emotional design.
 * Every drop has a lifespan. The countdown is quiet, italic, and dims the
 * closer it gets to zero.
 *
 *   > 48h left   →  "fades in 2d 14h"        (ambient grey)
 *   > 12h left   →  "fades in 23h"           (theme-accent @ 45% opacity)
 *   >  1h left   →  "fades in 47m"           (theme-accent @ 70% opacity)
 *   <  1h left   →  "fades in 4m"            (theme-accent @ full)
 *     expired    →  "this drop is gone"      (strikethrough, 35% opacity)
 *
 * Ticks once every 30s — light enough to keep on every feed card.
 *
 * Props:
 *   createdAt   — ISO string or Date; when the drop was created
 *   ttlHours    — default 72
 *   accent      — theme accent hex (falls back to Anonixx coral)
 *   align       — 'left' | 'right' (default 'right')
 *   prefix      — override prefix text (default 'fades in ')
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { rf, rp } from '../../utils/responsive';

const DEFAULT_TTL = 72;  // hours
const TICK_MS     = 30 * 1000;

// Convert ms remaining to a short human string.
const formatRemaining = (ms) => {
  if (ms <= 0) return 'gone';
  const totalSec = Math.floor(ms / 1000);
  const days     = Math.floor(totalSec / 86400);
  const hours    = Math.floor((totalSec % 86400) / 3600);
  const minutes  = Math.floor((totalSec % 3600) / 60);

  if (days > 0)  return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSec}s`;
};

const DropExpiryTimer = React.memo(function DropExpiryTimer({
  createdAt,
  ttlHours = DEFAULT_TTL,
  accent   = '#FF634A',
  align    = 'right',
  prefix   = 'fades in ',
  size     = 'sm',     // 'sm' | 'md'
}) {
  // Compute expiry once (stable) and tick time-remaining.
  const expiresAtMs = useMemo(() => {
    const created = createdAt ? new Date(createdAt).getTime() : Date.now();
    return created + ttlHours * 3600 * 1000;
  }, [createdAt, ttlHours]);

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    // If already expired, don't bother ticking.
    if (Date.now() >= expiresAtMs) return;
    const interval = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, [expiresAtMs]);

  const remaining = expiresAtMs - nowMs;
  const expired   = remaining <= 0;

  // Urgency tint
  let color   = 'rgba(154,154,163,0.55)';
  let opacity = 0.55;
  if (!expired) {
    if (remaining <= 60 * 60 * 1000) {           // < 1 hour
      color   = accent;
      opacity = 1;
    } else if (remaining <= 12 * 3600 * 1000) {  // < 12h
      color   = accent;
      opacity = 0.7;
    } else if (remaining <= 48 * 3600 * 1000) {  // < 48h
      color   = accent;
      opacity = 0.45;
    }
  } else {
    color   = '#6a6f82';
    opacity = 0.35;
  }

  const fontSize = size === 'md' ? rf(12) : rf(10);

  const textValue = expired
    ? 'this drop is gone'
    : `${prefix}${formatRemaining(remaining)}`;

  return (
    <View style={[styles.wrap, align === 'left' ? styles.left : styles.right]}>
      <Text
        style={[
          styles.text,
          {
            color,
            opacity,
            fontSize,
            textDecorationLine: expired ? 'line-through' : 'none',
          },
        ]}
        numberOfLines={1}
      >
        {textValue}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: rp(2),
  },
  left:  { alignItems: 'flex-start' },
  right: { alignItems: 'flex-end' },
  text: {
    fontFamily:    'DMSans-Italic',
    letterSpacing: 0.4,
  },
});

export default DropExpiryTimer;
