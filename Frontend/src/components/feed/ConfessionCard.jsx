/** The body of a text-only confession in the swipe feed: category label, a headline (the
 * opening line), the confession, compact facts and one action that fits the category.
 * Curiosity and Vulnerable open the comments (free); Link Up knocks (coins only on Let In).
 * "Read the rest" expands the text in place (it scrolls inside the card); "Show less" folds it.
 * Same design as the website (Web/components/ConfessionCard.tsx). The slide around it
 * (rail, author row, gestures, menus) stays in DropsSwipeScreen. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Coins, Feather, Flame, MessageCircle, Sparkles } from 'lucide-react-native';

import { T } from '../../utils/theme';
import { rf, rp, rs, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { splitHook } from '../../utils/captionHook';
import { timeLeft } from '../../config/linkup';

// Tints are existing tokens only: coral for Link Up, violet for Curiosity, soft white for Vulnerable.
export const CATEGORIES = {
  curiosity: {
    label: 'Curiosity', tint: T.violet, Icon: Sparkles,
    action: 'Ask what happened next',
  },
  linkup: {
    label: 'Link Up', tint: T.primary, Icon: Flame,
    action: null,   // the Knock button
  },
  vulnerable: {
    label: 'Vulnerable', tint: T.text, Icon: Feather,
    action: "I've felt this too",
  },
};

export const categoryOf = (post) =>
  CATEGORIES[post?.category] ? post.category : post?.kind === 'hookup' ? 'linkup' : 'curiosity';

// '#RRGGBB' token -> rgba at `a`, for glows and borders that stay on-palette.
export const alpha = (hex, a) => {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(255,255,255,${a})`;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// Headline + body. A real first sentence or line becomes the headline; a short confession is
// all headline; a long run-on with no sentence break is all body.
export function splitConfession(text) {
  const t = (text || '').trim();
  if (!t) return { head: '', body: '' };
  const parts = splitHook(t);
  if (!parts) return { head: '', body: t };
  if (!parts.rest) return { head: t.length <= 160 ? t : '', body: t.length <= 160 ? '' : t };
  if (parts.inline) return { head: '', body: t };
  return { head: parts.hook, body: parts.rest };
}

const HOSTING = { can_host: 'can host', can_travel: 'can travel', either: 'host or travel' };
const WHEN = { asap: 'ASAP', today: 'Today', tonight: 'Tonight', week: 'This week', flexible: 'Flexible' };
const FRESH = { tonight: 'Tonight', weekend: 'This weekend', week: 'This week', flexible: 'Flexible' };
const TOPIC_LABEL = (t) => (t === 'growth' ? 'Personal growth' : t.charAt(0).toUpperCase() + t.slice(1));

// Compact facts for the chips. Area is the poster's own words (never coordinates).
export function linkUpFacts(h, liveUntil) {
  if (!h) return [];
  const range = !h.age_min && !h.age_max ? ''
    : h.age_min && h.age_min === h.age_max ? `${h.age_min}` : `${h.age_min || 18}–${h.age_max || 99}`;
  const who = h.looking_for === 'woman' ? 'Into women' : h.looking_for === 'man' ? 'Into men'
    : h.looking_for === 'anyone' ? 'Open to anyone' : range ? 'Looking for' : null;
  const left = timeLeft(liveUntil);
  const when = WHEN[h.guided?.meet_when] || FRESH[h.fresh_window] || null;
  return [
    // live posts count down; a draft (no liveUntil yet) just shows when
    left ? { text: `${when || 'Live'} · ${left}`, hot: true } : liveUntil ? { text: 'Ended' } : when ? { text: when, hot: true } : null,
    h.age ? { text: `${h.age}${h.gender && h.gender !== 'other' ? ` · ${h.gender}` : ''}` } : null,
    h.area ? { text: h.area } : null,
    who ? { text: `${who}${range ? ` ${range}` : ''}` } : null,
    ...(h.vibes || []).slice(0, 2).map((v) => ({ text: v })),
    HOSTING[h.guided?.hosting] ? { text: HOSTING[h.guided.hosting] } : null,
    h.guided?.public_first ? { text: 'public first' } : null,
  ].filter(Boolean);
}

// Knock CTA. Says what a knock is and what it costs before anyone taps.
// cost 0 = free for this viewer (premium).
export const KnockButton = React.memo(({ name, cost, onPress, compact }) => (
  <TouchableOpacity
    onPress={onPress} activeOpacity={0.88} hitSlop={HIT_SLOP}
    accessibilityRole="button"
    accessibilityLabel={`Knock on ${name || 'their'} door`}
    accessibilityHint={cost ? `Free to knock. ${cost} coins only if they let you in.` : 'Free for you.'}
    style={[k.wrap, compact && k.wrapCompact]}
  >
    <LinearGradient
      colors={[T.primary, alpha(T.primary, 0.82)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[k.btn, compact && k.btnCompact]}
    >
      <View style={k.labelCol}>
        <Text style={k.label} numberOfLines={2}>
          Knock{name ? ' on ' : ''}{name ? <Text style={k.name}>{name}</Text> : null}{name ? "'s door" : ''}
        </Text>
        {!compact && (
          <Text style={k.sub}>
            {cost ? `Free to knock · ${cost} coins only if they let you in` : 'Free for you · they decide who comes in'}
          </Text>
        )}
      </View>
      <View style={k.cost}>
        <Coins size={rs(13)} color={T.gold} />
        <Text style={k.costText}>{cost ? cost : 'Free'}</Text>
      </View>
    </LinearGradient>
  </TouchableOpacity>
));

const Chip = ({ text, hot, tint }) => (
  <Text style={[c.chip, hot && { backgroundColor: alpha(tint, 0.9), color: '#fff', borderColor: 'transparent' }]} numberOfLines={1}>
    {text}
  </Text>
);

function ConfessionCard({
  post, isOwnPost, knockCost, onKnock, onComment, onExtend,
  topInset = 0, bottomInset = 0, headlineFont,
}) {
  const { height: winH } = useWindowDimensions();
  const cat = categoryOf(post);
  const meta = CATEGORIES[cat];
  const { head, body } = useMemo(() => splitConfession(post.content), [post.content]);
  const facts = useMemo(
    () => (cat === 'linkup' ? linkUpFacts(post.hookup, post.live_until)
      : (post.topics || []).slice(0, 3).map((t) => ({ text: TOPIC_LABEL(t) }))),
    [cat, post.hookup, post.live_until, post.topics],
  );
  const short = winH < 700;
  const bodyLines = short ? 5 : 8;
  const headOnly = head && !body;
  // Rough fit check: anything past what the clamp shows gets "Read the rest".
  const cut = (body.length > (short ? 220 : 340)) || (head.length > 150);
  const canKnock = cat === 'linkup' && !isOwnPost && !post.is_admin_drop;
  const Icon = meta.Icon;
  const [open, setOpen] = useState(false);
  const scrollRef = useRef(null);
  useEffect(() => { setOpen(false); }, [post.id]);
  // Open text gets the room left after the label, chips, action and the slide's insets.
  const openMax = Math.max(rs(160), winH - topInset - bottomInset - rp(250));
  const toggle = () => {
    if (open) scrollRef.current?.scrollTo({ y: 0, animated: false });
    setOpen((o) => !o);
  };

  const copy = (
    <View style={[c.copy, { borderLeftColor: alpha(meta.tint, 0.55) }]}>
      {head ? (
        <Text
          style={[c.head, headOnly && c.headBig, headlineFont]}
          numberOfLines={open ? undefined : (headOnly ? 6 : 4)}
        >
          {head}
        </Text>
      ) : null}
      {body ? (
        <Text style={[c.body, !head && c.bodyLead]} numberOfLines={open ? undefined : bodyLines}>{body}</Text>
      ) : null}
    </View>
  );

  return (
    <View style={[StyleSheet.absoluteFill, c.root, { paddingTop: topInset, paddingBottom: bottomInset }]} pointerEvents="box-none">
      {/* Category glow behind the text, from the category's own token. */}
      <LinearGradient
        pointerEvents="none"
        colors={[alpha(meta.tint, 0.16), 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0.6 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={c.block} pointerEvents="box-none">
        <View>
          <View pointerEvents="none" style={[c.label, { borderColor: alpha(meta.tint, 0.35), backgroundColor: alpha(meta.tint, 0.1) }]}>
            <Icon size={rs(12)} color={meta.tint} strokeWidth={2.4} />
            <Text style={[c.labelText, { color: meta.tint }]}>{meta.label}</Text>
          </View>

          {/* Closed, taps pass through to the double-tap layer; open, the text scrolls on its own. */}
          {open ? (
            <ScrollView
              ref={scrollRef}
              style={{ maxHeight: openMax }}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              contentContainerStyle={c.openPad}
            >
              {copy}
            </ScrollView>
          ) : (
            <View pointerEvents="none">{copy}</View>
          )}
        </View>

        {(cut || open) && (
          <TouchableOpacity
            onPress={toggle} hitSlop={HIT_SLOP} style={c.more}
            accessibilityRole="button" accessibilityState={{ expanded: open }}
          >
            <Text style={c.moreText}>{open ? 'Show less' : 'Read the rest'}</Text>
          </TouchableOpacity>
        )}

        {(facts.length > 0 || (isOwnPost && cat === 'linkup' && post.live_until)) && (
          <View style={c.chips} pointerEvents="box-none">
            {facts.map((f) => <Chip key={f.text} {...f} tint={meta.tint} />)}
            {isOwnPost && cat === 'linkup' && post.live_until && onExtend ? (
              <TouchableOpacity onPress={onExtend} hitSlop={HIT_SLOP} style={c.extend}>
                <Text style={c.extendText}>+12h</Text>
              </TouchableOpacity>
            ) : null}
            {cat === 'linkup' && !!post.linkup_count && <Chip text={`${post.linkup_count} linked up`} tint={meta.tint} />}
          </View>
        )}

        <View style={c.actions} pointerEvents="box-none">
          {canKnock ? (
            <KnockButton name={post.anonymous_name} cost={knockCost} onPress={onKnock} />
          ) : meta.action ? (
            <TouchableOpacity
              onPress={onComment} activeOpacity={0.85} hitSlop={HIT_SLOP} accessibilityRole="button"
              style={[c.soft, { borderColor: alpha(meta.tint, 0.4), backgroundColor: alpha(meta.tint, 0.08) }]}
            >
              <MessageCircle size={rs(16)} color={meta.tint} strokeWidth={2.2} />
              <Text style={[c.softText, { color: meta.tint === T.text ? T.text : meta.tint }]}>{meta.action}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default React.memo(ConfessionCard);

// The same card, in flow and scaled down: the composers' live preview of how it reads in the feed.
export const ConfessionPreview = React.memo(({ category, text, facts = [], name, placeholder, right }) => {
  const meta = CATEGORIES[category] || CATEGORIES.curiosity;
  const { head, body } = splitConfession(text);
  const Icon = meta.Icon;
  return (
    <View style={[p.card, { borderColor: alpha(meta.tint, 0.28) }]}>
      <LinearGradient
        pointerEvents="none" colors={[alpha(meta.tint, 0.14), 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 0.8 }} style={StyleSheet.absoluteFill}
      />
      <View style={p.top}>
        <View style={[c.label, { marginBottom: 0, borderColor: alpha(meta.tint, 0.35), backgroundColor: alpha(meta.tint, 0.1) }]}>
          <Icon size={rs(11)} color={meta.tint} strokeWidth={2.4} />
          <Text style={[c.labelText, p.labelText, { color: meta.tint }]}>{meta.label}</Text>
        </View>
        {right}
      </View>
      <View style={[c.copy, { borderLeftColor: alpha(meta.tint, 0.55) }]}>
        {head ? <Text style={[c.head, p.head]}>{head}</Text> : null}
        {body ? <Text style={[c.body, p.body]}>{body}</Text> : null}
        {!head && !body ? <Text style={[c.body, p.body, { color: T.textMute }]}>{placeholder || 'Your confession shows here as you write.'}</Text> : null}
      </View>
      {facts.length > 0 && (
        <View style={[c.chips, { marginLeft: rp(16) }]}>
          {facts.map((f) => <Chip key={f.text} {...f} tint={meta.tint} />)}
        </View>
      )}
      {name ? <Text style={p.by}>{name} · just now</Text> : null}
    </View>
  );
});

const c = StyleSheet.create({
  root: { justifyContent: 'center', paddingLeft: rp(20), paddingRight: rp(76) },
  block: { gap: rp(14) },
  label: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: rp(6),
    paddingHorizontal: rp(10), paddingVertical: rp(5), borderRadius: RADIUS.full, borderWidth: 1,
    marginBottom: rp(14),
  },
  labelText: { fontFamily: 'DMSans-Bold', fontSize: rf(12), letterSpacing: 1.2, textTransform: 'uppercase' },
  copy: { borderLeftWidth: 2, paddingLeft: rp(14), gap: rp(10) },
  head: {
    fontFamily: 'DMSans-Bold', fontSize: rf(21), lineHeight: rf(28), color: T.text, letterSpacing: -0.2,
  },
  headBig: { fontSize: rf(24), lineHeight: rf(32) },
  body: {
    fontFamily: 'DMSans-Regular', fontSize: rf(17), lineHeight: rf(26), color: alpha(T.text, 0.82),
  },
  bodyLead: { fontSize: rf(18), lineHeight: rf(27), color: T.text },
  openPad: { paddingBottom: rp(6) },
  more: { alignSelf: 'flex-start', marginLeft: rp(16), marginTop: -rp(4) },
  moreText: { fontFamily: 'DMSans-SemiBold', fontSize: rf(14), color: T.text, textDecorationLine: 'underline' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: rp(6), marginLeft: rp(16) },
  chip: {
    fontFamily: 'DMSans-SemiBold', fontSize: rf(12.5), color: T.text, overflow: 'hidden',
    paddingHorizontal: rp(10), paddingVertical: rp(5), borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: T.borderStrong,
  },
  extend: { backgroundColor: T.gold, paddingHorizontal: rp(10), paddingVertical: rp(5), borderRadius: RADIUS.full },
  extendText: { fontFamily: 'DMSans-Bold', fontSize: rf(12), color: T.background },
  actions: { marginTop: rp(4) },
  soft: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: rp(8),
    paddingHorizontal: rp(16), paddingVertical: rp(11), borderRadius: RADIUS.full, borderWidth: 1,
  },
  softText: { fontFamily: 'DMSans-SemiBold', fontSize: rf(15) },
});

const p = StyleSheet.create({
  card: {
    overflow: 'hidden', borderRadius: RADIUS.lg, borderWidth: 1, backgroundColor: T.surfaceDark,
    padding: rp(16), gap: rp(12),
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelText: { fontSize: rf(11) },
  head: { fontSize: rf(18), lineHeight: rf(25) },
  body: { fontSize: rf(15), lineHeight: rf(23) },
  by: { fontFamily: 'DMSans-Regular', fontSize: rf(12), color: T.textSecondary },
});

const k = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch', borderRadius: RADIUS.lg,
    shadowColor: T.primary, shadowOffset: { width: 0, height: rs(6) }, shadowOpacity: 0.45, shadowRadius: rs(14), elevation: 6,
  },
  wrapCompact: { alignSelf: 'flex-start', borderRadius: RADIUS.full },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: rp(12),
    paddingVertical: rp(12), paddingHorizontal: rp(16), borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  btnCompact: { paddingVertical: rp(10), borderRadius: RADIUS.full },
  labelCol: { flex: 1, minWidth: 0 },
  label: { fontFamily: 'DMSans-Bold', fontSize: rf(16), color: '#fff' },
  name: { fontFamily: 'DMSans-Bold' },
  sub: { fontFamily: 'DMSans-Regular', fontSize: rf(12.5), color: 'rgba(255,255,255,0.86)', marginTop: rp(2) },
  cost: {
    flexDirection: 'row', alignItems: 'center', gap: rp(4),
    backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: RADIUS.full, paddingHorizontal: rp(9), paddingVertical: rp(5),
  },
  costText: { fontFamily: 'DMSans-Bold', fontSize: rf(13), color: T.gold },
});
