/** Guided hookup composer, one screen: four short sections for the card, the confession in
 * their own words, then the live preview and Drop. The server picks the sound.
 * Progress is saved as it changes. Posts via POST /drops (kind="hookup") with all the usual checks. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch, useSelector } from 'react-redux';
import { ChevronLeft, MapPin, Check } from 'lucide-react-native';

import { rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { countryHeader } from '../../utils/country';
import { awardMilestone, fetchBalance } from '../../store/slices/coinsSlice';
import { WANTS, MEET_WHEN, FRESH_FOR_WHEN } from '../../utils/hookupDraft';
import AgeGate from './AgeGate';
import { ConfessionPreview, linkUpFacts, alpha } from '../feed/ConfessionCard';
import T from '../../utils/theme';

// Must match DROP_POST_COST in Backend/app/api/v1/drops.py.
const POST_COST = 3;
export const GUIDED_SAVE_KEY = 'anonixx.drops.guided.v1';
const SAVE_KEY = GUIDED_SAVE_KEY;
// The poster's own age, remembered after their first hookup post so it's filled in next time.
const MY_AGE_KEY = 'anonixx.hookup.age';
const MAX_CHARS = 500;

// Ids must match HOOKUP_* in Backend/app/api/v1/drops.py.
const GENDERS = [['woman', 'woman'], ['man', 'man'], ['other', 'person']];
const LOOKING = [['man', 'man'], ['woman', 'woman'], ['anyone', 'anyone']];
const HOSTING = [['can_host', 'I can host'], ['can_travel', 'You host']];
const FRESH_HINT = {
  tonight: "It's up for 12 hours. You can add more, up to 2 days.",
  week: "It's up for 7 days.",
  flexible: "It's up for 7 days. Renew it when it runs out.",
};

const EMPTY = {
  age: '', gender: null, area: '',
  lookingFor: 'anyone', ageMin: '', ageMax: '',
  wants: [],
  when: 'tonight', hosting: null,
  note: '', want: '', dontWant: '',
};

const digits = (v) => v.replace(/\D/g, '').slice(0, 2);
const toggleIn = (list, v, max) => (list.includes(v) ? list.filter((x) => x !== v) : list.length < max ? [...list, v] : list);

// What still stops them continuing (only "About me" is required).
function formProblem(a) {
  const age = Number(a.age);
  if (!a.age) return 'Add your age.';
  if (age < 18) return 'You have to be 18 or older to post here.';
  if (age > 99) return 'Enter a real age.';
  if (!a.area.trim()) return 'Add where you are.';
  const lo = Number(a.ageMin), hi = Number(a.ageMax);
  if ((a.ageMin && lo < 18) || (a.ageMax && hi < 18)) return 'Everyone here is 18+, so start at 18.';
  return '';
}

// The age they want: one age ("30") or a range ("28–35"). One box filled = that exact age.
const wantedRange = (a) => {
  const lo = a.ageMin ? Number(a.ageMin) : null;
  const hi = a.ageMax ? Number(a.ageMax) : null;
  const [x, y] = [lo ?? hi, hi ?? lo];
  return x != null && y != null && x > y ? [y, x] : [x, y];
};

async function authedFetch(path, body) {
  const token = await AsyncStorage.getItem('token');
  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...countryHeader(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

const isAgeGate = (data) => data?.detail?.code === 'age_verification_required';
const detailText = (data, fallback) => (typeof data?.detail === 'string' ? data.detail : data?.detail?.message || fallback);

function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[s.chip, active && s.chipOn]} accessibilityState={{ selected: active }}>
      {active && <Check size={rs(13)} color={T.primary} strokeWidth={2.5} />}
      <Text style={[s.chipText, active && s.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Field({ icon, style, ...props }) {
  return (
    <View style={[s.field, style]}>
      {icon}
      <TextInput placeholderTextColor={T.textMute} style={s.fieldInput} {...props} />
    </View>
  );
}

function Label({ children, optional }) {
  return (
    <Text style={s.label}>
      {children}{optional ? <Text style={s.optional}>  optional</Text> : null}
    </Text>
  );
}

// A tick-box (or, with `radio`, single-choice) row, like a printed form.
function CheckRow({ label, on, onPress, radio }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[s.checkRow, on && s.checkRowOn]} accessibilityRole={radio ? 'radio' : 'checkbox'} accessibilityState={{ checked: on }}>
      <View style={[radio ? s.radio : s.box, on && s.boxOn]}>{on && (radio ? <View style={s.radioDot} /> : <Check size={rs(12)} color="#fff" strokeWidth={2.5} />)}</View>
      <Text style={[s.checkText, on && s.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Section({ n, title, sub, done, optional, children }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <View style={[s.num, done && s.numDone]}>
          {done ? <Check size={rs(12)} color="#fff" strokeWidth={2.5} /> : <Text style={s.numText}>{n || '+'}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.sectionTitle}>{n ? `${n}. ` : ''}{title.toUpperCase()}{optional ? <Text style={s.optional}>  optional</Text> : null}</Text>
          {sub ? <Text style={s.sectionSub}>{sub}</Text> : null}
        </View>
      </View>
      <View style={s.group}>{children}</View>
    </View>
  );
}

export default function GuidedConfession({ navigation, onBack }) {
  const { showToast } = useToast();
  const dispatch = useDispatch();
  const coinBalance = useSelector((state) => state.coins.balance);

  const [a, setA] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const set = (patch) => setA((cur) => ({ ...cur, ...patch }));

  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [ageGate, setAgeGate] = useState(false);

  // The chips the feed card will show, from the answers so far.
  const previewFacts = useMemo(() => {
    const [lo, hi] = wantedRange(a);
    return linkUpFacts({
      age: a.age ? Number(a.age) : null, gender: a.gender, area: a.area.trim(),
      looking_for: a.lookingFor, age_min: lo, age_max: hi, vibes: a.wants,
      guided: { meet_when: a.when, hosting: a.hosting },
    }, null);
  }, [a]);

  const problem = formProblem(a);

  // ── Restore and save answers ────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const saved = JSON.parse(await AsyncStorage.getItem(SAVE_KEY) || 'null');
        if (saved?.a) setA({ ...EMPTY, ...saved.a, wants: Array.isArray(saved.a.wants) ? saved.a.wants : [] });
        if (typeof saved?.text === 'string') setText(saved.text);
        const myAge = await AsyncStorage.getItem(MY_AGE_KEY);
        if (myAge && /^\d{2}$/.test(myAge)) setA((cur) => (cur.age ? cur : { ...cur, age: myAge }));
      } catch { /* corrupt or missing: start fresh */ }
      setReady(true);
    })();
    dispatch(fetchBalance());
  }, [dispatch]);

  useEffect(() => {
    if (!ready) return undefined;
    const t = setTimeout(() => {
      const started = !!text || JSON.stringify(a) !== JSON.stringify(EMPTY);
      (started
        ? AsyncStorage.setItem(SAVE_KEY, JSON.stringify({ started, a, text }))
        : AsyncStorage.removeItem(SAVE_KEY)
      ).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [a, text, ready]);


  // ── Publish ─────────────────────────────────────────────────
  const publish = useCallback(async () => {
    const body = text.trim();
    if (problem) return;
    if (!body) { showToast({ type: 'warning', message: 'Say something first. Even one honest line.' }); return; }
    setPosting(true);
    try {
      const [lo, hi] = wantedRange(a);
      const { res, data } = await authedFetch('/drops', {
        kind: 'hookup',
        confession: body,
        hookup: {
          age: Number(a.age),
          ...(a.gender ? { gender: a.gender } : {}),
          area: a.area.trim(),
          looking_for: a.lookingFor,
          ...(lo ? { age_min: lo, age_max: hi } : {}),
          vibes: a.wants,
          fresh_window: FRESH_FOR_WHEN[a.when] || 'tonight',
          guided: {
            meet_when: a.when,
            hosting: a.hosting,
            want: a.want.trim() || null,
            dont_want: a.dontWant.trim() || null,
            tone: null,
            ai_generated: false,
          },
        },
        theme: 'desire',
        mood_tag: 'longing',
        sensitivity: 'mature',
        font_style: 'classic',
        publisher_opt_in: false,
      });
      if (res.status === 403 && isAgeGate(data)) { setAgeGate(true); return; }
      if (res.status === 402) {
        showToast({ type: 'warning', title: 'Not enough coins', message: detailText(data, `Dropping it costs ${POST_COST} coins.`) });
        return;
      }
      if (!res.ok) throw new Error(detailText(data, `Server error ${res.status}`));
      await AsyncStorage.removeItem(SAVE_KEY);
      AsyncStorage.setItem(MY_AGE_KEY, a.age).catch(() => {});
      showToast({ type: 'success', title: 'Dropped.', message: 'Someone out there is about to read your secret.' });
      dispatch(awardMilestone('first_drop'));
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (err) {
      showToast({ type: 'error', message: err?.message || 'Could not drop it. Try again.' });
    } finally {
      setPosting(false);
    }
  }, [a, text, problem, dispatch, navigation, showToast]);

  // ── Form ────────────────────────────────────────────────────
  const aboutDone = !problem;
  function renderForm() {
    return (
      <>
        <Section n={1} title="About me" done={aboutDone}>
          <View style={s.row}>
            <Text style={s.lead}>I'm a</Text>
            <View style={[s.chips, { flex: 1 }]}>
              {GENDERS.map(([k, l]) => <Chip key={k} label={l} active={a.gender === k} onPress={() => set({ gender: a.gender === k ? null : k })} />)}
            </View>
          </View>
          <Label>Age</Label>
          <Field style={s.ageField} value={a.age} onChangeText={(v) => set({ age: digits(v) })} placeholder="Your age" keyboardType="number-pad" accessibilityLabel="Your age" />
          <Label>Location</Label>
          <Field
            icon={<MapPin size={rs(16)} color={T.textSecondary} />}
            value={a.area}
            onChangeText={(v) => set({ area: v.slice(0, 60) })}
            placeholder="Your town or area"
            accessibilityLabel="Your town or area"
          />
        </Section>

        <Section n={2} title="Who I'm looking for" done={!!a.ageMin || !!a.ageMax || a.lookingFor !== 'anyone'}>
          <View style={s.row}>
            <Text style={s.lead}>I'm looking for</Text>
            <View style={[s.chips, { flex: 1 }]}>
              {LOOKING.map(([k, l]) => <Chip key={k} label={l} active={a.lookingFor === k} onPress={() => set({ lookingFor: k })} />)}
            </View>
          </View>
          <Label optional>Preferred age range</Label>
          <View style={s.row}>
            <Field style={s.ageField} value={a.ageMin} onChangeText={(v) => set({ ageMin: digits(v) })} placeholder="Min" keyboardType="number-pad" accessibilityLabel="Minimum age" />
            <Text style={s.inline}>to</Text>
            <Field style={s.ageField} value={a.ageMax} onChangeText={(v) => set({ ageMax: digits(v) })} placeholder="Max" keyboardType="number-pad" accessibilityLabel="Maximum age" />
          </View>
        </Section>

        <Section n={3} title="What I'm looking for" sub="Tick up to three." done={a.wants.length > 0}>
          {WANTS.filter(([k]) => k !== 'on our terms').map(([k, l]) => (
            <CheckRow key={k} label={l} on={a.wants.includes(k)} onPress={() => set({ wants: toggleIn(a.wants, k, 3) })} />
          ))}
        </Section>

        <Section n={4} title="When I'd like to meet" sub={FRESH_HINT[FRESH_FOR_WHEN[a.when]]} done={!!a.when}>
          {MEET_WHEN.map(([k, l]) => <CheckRow key={k} label={l} radio on={a.when === k} onPress={() => set({ when: k })} />)}
          <Label optional>Hosting</Label>
          <View style={s.chips}>
            {HOSTING.map(([k, l]) => <Chip key={k} label={l} active={a.hosting === k} onPress={() => set({ hosting: a.hosting === k ? null : k })} />)}
          </View>
        </Section>

        <Section n={5} title="Your confession" sub="Introduce yourself and say what you're looking for, in your own words. Your identity stays private." done={!!text.trim()}>
          <View style={s.card}>
            <LinearGradient pointerEvents="none" colors={[alpha(T.primary, 0.14), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 0.8 }} style={StyleSheet.absoluteFill} />
            <TextInput
              style={s.cardInput}
              value={text}
              onChangeText={(v) => setText(v.slice(0, MAX_CHARS))}
              placeholder="Hello, I'm… Say who you are, who you want and when."
              placeholderTextColor={T.textMute}
              multiline
              textAlignVertical="top"
            />
            <Text style={[s.counter, { alignSelf: 'flex-end' }]}>{MAX_CHARS - text.length}</Text>
          </View>
        </Section>

        {/* Live preview: the feed card as it will look, with their words as they type. */}
        <Text style={s.previewKicker}>live preview</Text>
        <ConfessionPreview category="linkup" text={text} facts={previewFacts} placeholder="Your words show up here as you type." />
      </>
    );
  }

  if (ageGate) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setAgeGate(false)} hitSlop={HIT_SLOP}><ChevronLeft size={rs(24)} color={T.text} /></TouchableOpacity>
        </View>
        <View style={{ padding: SPACING.md }}><AgeGate onDone={() => setAgeGate(false)} /></View>
      </SafeAreaView>
    );
  }

  const doneCount = [aboutDone, !!a.ageMin || !!a.ageMax || a.lookingFor !== 'anyone', a.wants.length > 0, !!a.when, !!text.trim()].filter(Boolean).length;
  const missing = problem || (!text.trim() ? 'Write your confession above.' : '');
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} hitSlop={HIT_SLOP} accessibilityLabel="Back">
            <ChevronLeft size={rs(24)} color={T.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Hookup confession</Text>
          <View style={s.progress}>
            {[0, 1, 2, 3, 4].map((i) => <View key={i} style={[s.seg, i < doneCount && s.segOn]} />)}
          </View>
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {renderForm()}
          <View style={s.footer}>
            <View style={s.footRow}>
              <TouchableOpacity
                style={[s.primaryBtn, (!!missing || posting) && s.primaryOff]}
                onPress={publish}
                disabled={!!missing || posting}
                activeOpacity={0.85}
              >
                {posting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Drop it · {POST_COST} coins</Text>}
              </TouchableOpacity>
            </View>
            <Text style={s.footNote}>
              {missing || `18+ only. Balance ${coinBalance ?? 0}.`}
              {!missing && coinBalance < POST_COST ? <Text style={s.link} onPress={() => navigation.navigate('Coins')}>  Top up</Text> : null}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  headerTitle: { color: T.text, fontFamily: 'DMSans-Bold', fontSize: FONT.md },
  progress: { flex: 1, flexDirection: 'row', gap: rs(5), marginLeft: SPACING.sm },
  seg: { flex: 1, height: rs(3), borderRadius: rs(2), backgroundColor: T.borderStrong },
  segOn: { backgroundColor: T.primary },

  previewKicker: { color: T.textSecondary, fontFamily: 'DMSans-Bold', fontSize: FONT.xs, letterSpacing: 1.5, marginBottom: SPACING.sm, textTransform: 'uppercase' },

  scroll: { padding: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.xl, gap: SPACING.md },
  section: { borderRadius: RADIUS.lg, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, padding: SPACING.md, gap: SPACING.sm, marginBottom: SPACING.md },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  num: { width: rs(24), height: rs(24), borderRadius: rs(12), borderWidth: 1, borderColor: T.primaryBorder, alignItems: 'center', justifyContent: 'center', marginTop: rs(1) },
  numDone: { backgroundColor: T.primary, borderColor: T.primary },
  numText: { color: T.primary, fontFamily: 'DMSans-Bold', fontSize: FONT.xs },
  sectionTitle: { color: T.text, fontFamily: 'DMSans-Bold', fontSize: FONT.sm, letterSpacing: 1.2, marginTop: rs(3) },
  lead: { color: T.text, fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.lg },
  checkRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: rp(12), paddingVertical: rp(12),
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.borderStrong, backgroundColor: T.background,
  },
  checkRowOn: { borderColor: T.primary, backgroundColor: T.primaryDim },
  checkText: { flex: 1, color: T.textSecondary, fontFamily: 'DMSans-SemiBold', fontSize: FONT.sm },
  box: { width: rs(20), height: rs(20), borderRadius: rs(6), borderWidth: 1.5, borderColor: T.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radio: { width: rs(20), height: rs(20), borderRadius: rs(10), borderWidth: 1.5, borderColor: T.borderStrong, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: T.primary, borderColor: T.primary },
  radioDot: { width: rs(8), height: rs(8), borderRadius: rs(4), backgroundColor: '#fff' },
  sectionSub: { color: T.textMute, fontFamily: 'DMSans-Regular', fontSize: FONT.xs, marginTop: rs(2), lineHeight: rf(17) },


  group: { gap: SPACING.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  inline: { color: T.textSecondary, fontFamily: 'DMSans-Regular', fontSize: FONT.sm },
  label: { color: T.text, fontFamily: 'DMSans-SemiBold', fontSize: FONT.sm, marginTop: SPACING.sm },
  optional: { color: T.textMute, fontFamily: 'DMSans-Regular', fontSize: FONT.xs },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: rs(5),
    paddingHorizontal: rp(14), paddingVertical: rp(9), borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: T.borderStrong, backgroundColor: T.background,
  },
  chipOn: { borderColor: T.primary, backgroundColor: T.primaryDim },
  chipText: { color: T.textSecondary, fontFamily: 'DMSans-SemiBold', fontSize: FONT.sm },
  chipTextOn: { color: T.text },

  field: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: rp(14), borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.borderStrong, backgroundColor: T.background,
  },
  fieldInput: { flex: 1, color: T.text, fontFamily: 'DMSans-Regular', fontSize: FONT.md, paddingVertical: rp(12) },
  ageField: { width: rs(78) },

  counter: { color: T.textMute, fontFamily: 'DMSans-Regular', fontSize: FONT.xs, textAlign: 'right' },

  // Same surface as the live preview card below it.
  card: { overflow: 'hidden', borderRadius: RADIUS.lg, borderWidth: 1, borderColor: alpha(T.primary, 0.28), backgroundColor: T.surfaceDark, padding: rp(16), gap: SPACING.sm },
  cardInput: { minHeight: rs(170), color: T.text, fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.lg, lineHeight: rf(28) },

  footer: { paddingTop: SPACING.lg, gap: SPACING.xs },
  footRow: { flexDirection: 'row', gap: SPACING.sm },
  primaryBtn: { flex: 1, height: BUTTON_HEIGHT, borderRadius: RADIUS.full, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  primaryOff: { opacity: 0.4 },
  primaryText: { color: '#fff', fontFamily: 'DMSans-Bold', fontSize: FONT.md },
  footNote: { color: T.textSecondary, fontFamily: 'DMSans-Regular', fontSize: FONT.xs, textAlign: 'center' },
  link: { color: T.primary, fontFamily: 'DMSans-Bold' },
});
