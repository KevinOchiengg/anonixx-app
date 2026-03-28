/**
 * ScheduleEventScreen.jsx
 * The creator announces their next live event.
 * Like pinning a note to a dark wall: "I'll be here. Come find me."
 *
 * Design: Sparse, intentional, atmospheric.
 * The circle's aura color carries through from the profile.
 * Every field feels like a decision, not a form.
 */
import React, {
  useState, useCallback, useRef, useEffect,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Animated, ActivityIndicator,
  KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Calendar, Clock, Radio } from 'lucide-react-native';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import StarryBackground from '../../components/common/StarryBackground';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  surfaceAlt:    '#1a1f2e',
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.12)',
  primaryBorder: 'rgba(255,99,74,0.25)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  textMuted:     '#5a5f70',
  border:        'rgba(255,255,255,0.06)',
  inputBg:       'rgba(255,255,255,0.04)',
};

// ─── Static data ──────────────────────────────────────────────────────────────
const QUICK_TIMES = [
  { label: 'In 1 hour',    hours: 1  },
  { label: 'In 3 hours',   hours: 3  },
  { label: 'Tonight 9pm',  hour: 21  },
  { label: 'Tomorrow 8pm', hour: 20, tomorrow: true },
];

const MIN_PRICE  = 0;
const PRICE_SUGGESTIONS = [0, 50, 100, 200, 500];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildQuickTime(opt) {
  const now = new Date();
  if (opt.hours) {
    now.setHours(now.getHours() + opt.hours, 0, 0, 0);
  } else if (opt.tomorrow) {
    now.setDate(now.getDate() + 1);
    now.setHours(opt.hour, 0, 0, 0);
  } else {
    now.setHours(opt.hour, 0, 0, 0);
    if (now <= new Date()) now.setDate(now.getDate() + 1);
  }
  return now;
}

function formatDisplayDate(date) {
  if (!date) return '';
  return date.toLocaleDateString('en-KE', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function padTwo(n) { return String(n).padStart(2, '0'); }

// ─── Time Picker ─────────────────────────────────────────────────────────────
const TimePicker = React.memo(({ date, onChange, accentColor }) => {
  const [showPicker, setShowPicker] = useState(false);
  const [tempDate,   setTempDate]   = useState(date ?? new Date());
  const sheetY  = useRef(new Animated.Value(300)).current;
  const sheetOp = useRef(new Animated.Value(0)).current;

  const openPicker = useCallback(() => {
    setTempDate(date ?? new Date());
    setShowPicker(true);
    Animated.parallel([
      Animated.spring(sheetY,  { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      Animated.timing(sheetOp, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [date]);

  const closePicker = useCallback(() => {
    Animated.parallel([
      Animated.timing(sheetY,  { toValue: 300, duration: 220, useNativeDriver: true }),
      Animated.timing(sheetOp, { toValue: 0,   duration: 220, useNativeDriver: true }),
    ]).start(() => setShowPicker(false));
  }, []);

  const confirm = useCallback(() => {
    onChange(tempDate);
    closePicker();
  }, [tempDate, onChange, closePicker]);

  const adjustDate = useCallback((field, delta) => {
    const d = new Date(tempDate);
    if (field === 'day')    d.setDate(d.getDate() + delta);
    if (field === 'hour')   d.setHours(d.getHours() + delta);
    if (field === 'minute') d.setMinutes(d.getMinutes() + delta);
    setTempDate(d);
  }, [tempDate]);

  return (
    <>
      <TouchableOpacity
        onPress={openPicker}
        style={[styles.dateDisplayBtn, date && { borderColor: accentColor + '40' }]}
        hitSlop={HIT_SLOP}
        activeOpacity={0.85}
      >
        <Calendar size={rs(16)} color={date ? accentColor : T.textMuted} />
        <Text style={[styles.dateDisplayText, date && { color: T.text }]}>
          {date ? formatDisplayDate(date) : 'Pick a date and time'}
        </Text>
      </TouchableOpacity>

      {showPicker && (
        <Animated.View style={[
          styles.pickerOverlay,
          { opacity: sheetOp }
        ]}>
          <TouchableOpacity
            style={styles.pickerBackdrop}
            onPress={closePicker}
            activeOpacity={1}
          />
          <Animated.View style={[
            styles.pickerSheet,
            { transform: [{ translateY: sheetY }] }
          ]}>
            <View style={styles.pickerHandle} />
      <StarryBackground />
            <Text style={styles.pickerTitle}>When is your live?</Text>

            {/* Day / Hour / Minute spinners */}
            <View style={styles.spinnerRow}>
              {/* Day */}
              <View style={styles.spinner}>
                <TouchableOpacity onPress={() => adjustDate('day', 1)} hitSlop={HIT_SLOP}>
                  <Text style={styles.spinnerArrow}>▲</Text>
                </TouchableOpacity>
                <Text style={styles.spinnerValue}>
                  {tempDate.toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric' })}
                </Text>
                <TouchableOpacity onPress={() => adjustDate('day', -1)} hitSlop={HIT_SLOP}>
                  <Text style={styles.spinnerArrow}>▼</Text>
                </TouchableOpacity>
              </View>

              {/* Hour */}
              <View style={styles.spinner}>
                <TouchableOpacity onPress={() => adjustDate('hour', 1)} hitSlop={HIT_SLOP}>
                  <Text style={styles.spinnerArrow}>▲</Text>
                </TouchableOpacity>
                <Text style={styles.spinnerValue}>{padTwo(tempDate.getHours())}</Text>
                <TouchableOpacity onPress={() => adjustDate('hour', -1)} hitSlop={HIT_SLOP}>
                  <Text style={styles.spinnerArrow}>▼</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.spinnerColon}>:</Text>

              {/* Minute */}
              <View style={styles.spinner}>
                <TouchableOpacity onPress={() => adjustDate('minute', 5)} hitSlop={HIT_SLOP}>
                  <Text style={styles.spinnerArrow}>▲</Text>
                </TouchableOpacity>
                <Text style={styles.spinnerValue}>{padTwo(tempDate.getMinutes())}</Text>
                <TouchableOpacity onPress={() => adjustDate('minute', -5)} hitSlop={HIT_SLOP}>
                  <Text style={styles.spinnerArrow}>▼</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.pickerConfirm, { backgroundColor: accentColor }]}
              onPress={confirm}
              hitSlop={HIT_SLOP}
              activeOpacity={0.85}
            >
              <Text style={styles.pickerConfirmText}>Set this time</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}
    </>
  );
});

// ─── Field Label ─────────────────────────────────────────────────────────────
const FieldLabel = React.memo(({ label, hint, required }) => (
  <View style={styles.fieldLabelWrap}>
    <Text style={styles.fieldLabel}>
      {label}{required && <Text style={{ color: T.primary }}> *</Text>}
    </Text>
    {hint && <Text style={styles.fieldHint}>{hint}</Text>}
  </View>
));

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ScheduleEventScreen({ route, navigation }) {
  const { circleId, circle } = route.params ?? {};
  const { showToast }        = useToast();

  const accentColor = circle?.aura_color ?? T.primary;

  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [eventDate,   setEventDate]   = useState(null);
  const [entryFee,    setEntryFee]    = useState('0');
  const [loading,     setLoading]     = useState(false);

  // Entrance animations
  const headerOp = useRef(new Animated.Value(0)).current;
  const formY    = useRef(new Animated.Value(24)).current;
  const formOp   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(headerOp, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(formOp, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(formY,  { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const canSubmit = title.trim() && eventDate;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleQuickTime = useCallback((opt) => {
    setEventDate(buildQuickTime(opt));
  }, []);

  const handleFeeChange = useCallback((text) => {
    setEntryFee(text.replace(/[^0-9]/g, ''));
  }, []);

  const handleFeeSuggestion = useCallback((val) => {
    setEntryFee(String(val));
  }, []);

  const handleSchedule = useCallback(async () => {
    if (!title.trim()) {
      showToast({ type: 'error', message: 'Give your event a title.' });
      return;
    }
    if (!eventDate) {
      showToast({ type: 'error', message: 'Pick a date and time.' });
      return;
    }
    if (eventDate <= new Date()) {
      showToast({ type: 'error', message: 'Schedule your event in the future.' });
      return;
    }

    const fee = parseInt(entryFee, 10) || 0;

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/circles/${circleId}/events/schedule`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            title:        title.trim(),
            description:  description.trim(),
            entry_fee:    fee,
            scheduled_at: eventDate.toISOString(),
          }),
        }
      );
      if (res.ok) {
        showToast({ type: 'success', message: 'Event scheduled. Your circle will be notified.' });
        navigation.goBack();
      } else {
        showToast({ type: 'error', message: 'Could not schedule event. Try again.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not schedule event. Try again.' });
    } finally {
      setLoading(false);
    }
  }, [title, description, eventDate, entryFee, circleId, navigation, showToast]);

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>

      {/* Aura glow */}
      <View style={[styles.auraGlow, { backgroundColor: accentColor }]} />

      {/* Header */}
      <Animated.View style={[styles.header, { opacity: headerOp }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={HIT_SLOP}
          style={styles.backBtn}
        >
          <ArrowLeft size={rs(22)} color={T.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Schedule a Live</Text>
          <Text style={styles.headerSub}>
            {circle?.name ?? 'Your Circle'}
          </Text>
        </View>
        <View style={{ width: rs(38) }} />
      </Animated.View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <Animated.View style={[
            styles.formWrap,
            { transform: [{ translateY: formY }], opacity: formOp }
          ]}>

            {/* Circle identity reminder */}
            <View style={[styles.circleTag, { borderColor: accentColor + '30' }]}>
              <Text style={styles.circleTagEmoji}>
                {circle?.avatar_emoji ?? '🎭'}
              </Text>
              <Text style={styles.circleTagName}>{circle?.name ?? 'Your Circle'}</Text>
              <View style={[styles.circleTagDot, { backgroundColor: accentColor }]} />
            </View>

            {/* ── Title ── */}
            <View style={styles.field}>
              <FieldLabel
                label="What's this live about"
                hint="One line that makes people want to show up."
                required
              />
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. The night I almost left everything behind"
                placeholderTextColor={T.textMuted}
                style={[styles.input, { borderColor: title ? accentColor + '30' : T.border }]}
                maxLength={80}
                returnKeyType="next"
              />
              <Text style={styles.charCount}>{title.length}/80</Text>
            </View>

            {/* ── Description ── */}
            <View style={styles.field}>
              <FieldLabel
                label="Tell them more"
                hint="Optional. What should they expect?"
              />
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="We'll talk about the things we never say sober…"
                placeholderTextColor={T.textMuted}
                style={[styles.textArea, { borderColor: description ? accentColor + '30' : T.border }]}
                multiline
                maxLength={200}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{description.length}/200</Text>
            </View>

            {/* ── Date & Time ── */}
            <View style={styles.field}>
              <FieldLabel
                label="When"
                hint="Pick the moment they'll gather."
                required
              />

              {/* Quick time chips */}
              <View style={styles.quickTimeRow}>
                {QUICK_TIMES.map(opt => (
                  <TouchableOpacity
                    key={opt.label}
                    onPress={() => handleQuickTime(opt)}
                    hitSlop={HIT_SLOP}
                    style={[
                      styles.quickChip,
                      eventDate && formatDisplayDate(buildQuickTime(opt)) === formatDisplayDate(eventDate)
                        && { backgroundColor: accentColor + '18', borderColor: accentColor + '40' },
                    ]}
                    activeOpacity={0.8}
                  >
                    <Clock size={rs(11)} color={T.textMuted} />
                    <Text style={styles.quickChipText}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TimePicker
                date={eventDate}
                onChange={setEventDate}
                accentColor={accentColor}
              />
            </View>

            {/* ── Entry Fee ── */}
            <View style={styles.field}>
              <FieldLabel
                label="Entry Fee (KES)"
                hint="Set to 0 for a free event. You keep 80% of every entry."
              />

              {/* Price suggestions */}
              <View style={styles.priceSuggestRow}>
                {PRICE_SUGGESTIONS.map(p => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => handleFeeSuggestion(p)}
                    hitSlop={HIT_SLOP}
                    style={[
                      styles.priceSuggest,
                      entryFee === String(p) && {
                        backgroundColor: accentColor + '18',
                        borderColor:     accentColor + '40',
                      },
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text style={[
                      styles.priceSuggestText,
                      entryFee === String(p) && { color: accentColor, fontWeight: '700' },
                    ]}>
                      {p === 0 ? 'Free' : `${p}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.feeInputRow}>
                <Text style={[styles.feeCurrency, { color: accentColor }]}>KES</Text>
                <TextInput
                  value={entryFee}
                  onChangeText={handleFeeChange}
                  placeholder="0"
                  placeholderTextColor={T.textMuted}
                  keyboardType="numeric"
                  style={[styles.feeInput, { borderColor: accentColor + '30' }]}
                  maxLength={6}
                />
              </View>

              {parseInt(entryFee, 10) > 0 && (
                <View style={[styles.earningsHint, { borderColor: accentColor + '25' }]}>
                  <Text style={styles.earningsHintText}>
                    💰 You earn{' '}
                    <Text style={{ color: accentColor, fontWeight: '700' }}>
                      KES {Math.round(parseInt(entryFee, 10) * 0.8)}
                    </Text>
                    {' '}per member. Anonixx keeps 20%.
                  </Text>
                </View>
              )}
            </View>

            {/* ── Event preview card ── */}
            {(title || eventDate) && (
              <View style={[styles.previewCard, { borderColor: accentColor + '25' }]}>
                <View style={[styles.previewDot, {
                  backgroundColor: eventDate ? accentColor : T.textMuted
                }]} />
                <View style={styles.previewContent}>
                  <Text style={styles.previewTitle} numberOfLines={1}>
                    {title || 'Event title'}
                  </Text>
                  <Text style={styles.previewMeta}>
                    {eventDate ? formatDisplayDate(eventDate) : 'Date TBD'}
                    {' · '}
                    {parseInt(entryFee, 10) > 0
                      ? `KES ${parseInt(entryFee, 10)}`
                      : 'Free'}
                  </Text>
                </View>
                <Radio size={rs(16)} color={accentColor} />
              </View>
            )}

            {/* ── Schedule button ── */}
            <View style={styles.submitWrap}>
              <View style={[styles.btnGlow, { backgroundColor: accentColor }]} />
              <TouchableOpacity
                onPress={handleSchedule}
                disabled={loading || !canSubmit}
                style={[
                  styles.submitBtn,
                  { backgroundColor: accentColor },
                  (!canSubmit || loading) && styles.submitBtnDisabled,
                ]}
                hitSlop={HIT_SLOP}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.submitBtnText}>
                      Pin this to the darkness
                    </Text>
                }
              </TouchableOpacity>
            </View>

            <Text style={styles.finePrint}>
              Your members will be notified when this goes live.
            </Text>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },

  auraGlow: {
    position:     'absolute',
    top:          -rs(80),
    alignSelf:    'center',
    width:        SCREEN_WIDTH * 1.2,
    height:       rs(200),
    opacity:      0.06,
    borderRadius: rs(100),
  },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  backBtn:      { padding: rp(4) },
  headerCenter: { alignItems: 'center' },
  headerTitle:  {
    fontSize:   FONT.lg,
    fontWeight: '700',
    color:      T.text,
    fontFamily: 'PlayfairDisplay-Bold',
  },
  headerSub: {
    fontSize:  FONT.xs,
    color:     T.textMuted,
    marginTop: rp(2),
    fontStyle: 'italic',
  },

  // Content
  content: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.md,
    paddingBottom:     rs(80),
  },
  formWrap: { gap: SPACING.lg },

  // Circle tag
  circleTag: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             SPACING.xs,
    backgroundColor: T.surface,
    borderRadius:    RADIUS.sm,
    borderWidth:     1,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(10),
    alignSelf:       'flex-start',
  },
  circleTagEmoji: { fontSize: rf(16) },
  circleTagName: {
    fontSize:   FONT.sm,
    fontWeight: '600',
    color:      T.text,
  },
  circleTagDot: {
    width:        rs(6),
    height:       rs(6),
    borderRadius: rs(3),
  },

  // Fields
  field:           { gap: rp(10) },
  fieldLabelWrap:  { gap: rp(3) },
  fieldLabel: {
    fontSize:      FONT.xs,
    fontWeight:    '700',
    color:         T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  fieldHint: {
    fontSize:  FONT.xs,
    color:     T.textMuted,
    fontStyle: 'italic',
  },

  // Inputs
  input: {
    backgroundColor:   T.inputBg,
    borderRadius:      RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(13),
    fontSize:          FONT.md,
    color:             T.text,
    borderWidth:       1,
  },
  textArea: {
    backgroundColor:   T.inputBg,
    borderRadius:      RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(13),
    fontSize:          FONT.md,
    color:             T.text,
    borderWidth:       1,
    minHeight:         rs(80),
    fontStyle:         'italic',
  },
  charCount: {
    fontSize:  FONT.xs,
    color:     T.textMuted,
    textAlign: 'right',
  },

  // Quick times
  quickTimeRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           SPACING.xs,
  },
  quickChip: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(4),
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(7),
    borderRadius:    RADIUS.sm,
    backgroundColor: T.surfaceAlt,
    borderWidth:     1,
    borderColor:     T.border,
  },
  quickChipText: {
    fontSize:   FONT.xs,
    color:      T.textSecondary,
    fontWeight: '500',
  },

  // Date display button
  dateDisplayBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             SPACING.xs,
    backgroundColor: T.inputBg,
    borderRadius:    RADIUS.sm,
    borderWidth:     1,
    borderColor:     T.border,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(14),
  },
  dateDisplayText: {
    fontSize:   FONT.sm,
    color:      T.textMuted,
    flex:       1,
  },

  // Picker overlay
  pickerOverlay: {
    position:        'absolute',
    top:             0,
    left:            -SPACING.md,
    right:           -SPACING.md,
    bottom:          -rs(80),
    zIndex:          100,
    justifyContent:  'flex-end',
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  pickerSheet: {
    backgroundColor:      T.surface,
    borderTopLeftRadius:  RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding:              SPACING.lg,
    paddingBottom:        rs(40),
    borderTopWidth:       1,
    borderColor:          T.border,
    gap:                  SPACING.md,
  },
  pickerHandle: {
    width:           rs(40),
    height:          rp(4),
    borderRadius:    rp(2),
    backgroundColor: T.border,
    alignSelf:       'center',
  },
  pickerTitle: {
    fontSize:   FONT.lg,
    fontWeight: '700',
    color:      T.text,
    textAlign:  'center',
    fontFamily: 'PlayfairDisplay-Bold',
  },
  spinnerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            SPACING.md,
  },
  spinner: {
    alignItems: 'center',
    gap:        SPACING.sm,
  },
  spinnerArrow: {
    fontSize:   rf(16),
    color:      T.textSecondary,
    paddingVertical: rp(4),
  },
  spinnerValue: {
    fontSize:   rf(22),
    fontWeight: '700',
    color:      T.text,
    minWidth:   rs(60),
    textAlign:  'center',
  },
  spinnerColon: {
    fontSize:   rf(22),
    fontWeight: '700',
    color:      T.textSecondary,
    marginTop:  -rs(8),
  },
  pickerConfirm: {
    height:         BUTTON_HEIGHT,
    borderRadius:   RADIUS.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  pickerConfirmText: {
    fontSize:   FONT.md,
    fontWeight: '700',
    color:      '#fff',
  },

  // Price suggestions
  priceSuggestRow: {
    flexDirection: 'row',
    gap:           SPACING.xs,
  },
  priceSuggest: {
    flex:            1,
    alignItems:      'center',
    paddingVertical: rp(9),
    borderRadius:    RADIUS.sm,
    backgroundColor: T.surfaceAlt,
    borderWidth:     1,
    borderColor:     T.border,
  },
  priceSuggestText: {
    fontSize:   FONT.sm,
    color:      T.textSecondary,
    fontWeight: '600',
  },

  // Fee input
  feeInputRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.xs,
  },
  feeCurrency: {
    fontSize:   FONT.md,
    fontWeight: '700',
  },
  feeInput: {
    flex:              1,
    backgroundColor:   T.inputBg,
    borderRadius:      RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(13),
    fontSize:          FONT.lg,
    fontWeight:        '700',
    color:             T.text,
    borderWidth:       1,
  },

  // Earnings hint
  earningsHint: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.sm,
    borderWidth:     1,
    padding:         SPACING.sm,
  },
  earningsHintText: {
    fontSize:  FONT.sm,
    color:     T.textSecondary,
    lineHeight: rf(20),
  },

  // Preview card
  previewCard: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    padding:         SPACING.md,
    gap:             SPACING.sm,
  },
  previewDot: {
    width:        rs(8),
    height:       rs(8),
    borderRadius: rs(4),
  },
  previewContent: { flex: 1 },
  previewTitle: {
    fontSize:   FONT.sm,
    fontWeight: '700',
    color:      T.text,
    marginBottom: rp(3),
  },
  previewMeta: {
    fontSize: FONT.xs,
    color:    T.textSecondary,
  },

  // Submit
  submitWrap: {
    position:   'relative',
    alignItems: 'center',
    marginTop:  SPACING.xs,
  },
  btnGlow: {
    position:     'absolute',
    width:        SCREEN_WIDTH * 0.6,
    height:       rs(60),
    borderRadius: rs(30),
    opacity:      0.2,
    top:          rs(10),
  },
  submitBtn: {
    width:          '100%',
    height:         BUTTON_HEIGHT,
    borderRadius:   RADIUS.md,
    alignItems:     'center',
    justifyContent: 'center',
    shadowOffset:   { width: 0, height: rs(6) },
    shadowOpacity:  0.4,
    shadowRadius:   rs(14),
    elevation:      8,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: {
    fontSize:      FONT.md,
    fontWeight:    '700',
    color:         '#fff',
    letterSpacing: 0.3,
    fontFamily:    'PlayfairDisplay-Bold',
  },
  finePrint: {
    fontSize:  FONT.xs,
    color:     T.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: -SPACING.xs,
  },
});
