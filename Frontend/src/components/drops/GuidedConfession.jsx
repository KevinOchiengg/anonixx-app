/** Guided hookup composer: five short sections on one screen with a live preview of the
 * confession, then a review to tweak it (or let the AI writer reword it), add a sound and post.
 * Progress is saved as it changes. Posts via POST /drops (kind="hookup") with all the usual checks. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Animated,
  ActivityIndicator, KeyboardAvoidingView, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useAudioPlayer } from 'expo-audio';
import { useDispatch, useSelector } from 'react-redux';
import { ChevronLeft, MapPin, RefreshCw, Check, Copy, Lock } from 'lucide-react-native';

import { rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { countryHeader } from '../../utils/country';
import { awardMilestone, fetchBalance } from '../../store/slices/coinsSlice';
import { hookupDraft, WANTS, MEET_WHEN, FRESH_FOR_WHEN } from '../../utils/hookupDraft';
import AgeGate from './AgeGate';
import T from '../../utils/theme';

// Must match DROP_POST_COST in Backend/app/api/v1/drops.py.
const POST_COST = 3;
export const GUIDED_SAVE_KEY = 'anonixx.drops.guided.v1';
const SAVE_KEY = GUIDED_SAVE_KEY;
// The poster's own age, remembered after their first hookup post so it's filled in next time.
const MY_AGE_KEY = 'anonixx.hookup.age';
const MAX_CHARS = 500;

// Ids must match HOOKUP_* in Backend/app/api/v1/drops.py.
const GENDERS = [['woman', 'Woman'], ['man', 'Man'], ['other', 'Other']];
const LOOKING = [['woman', 'Women'], ['man', 'Men'], ['anyone', 'Anyone']];
const HOSTING = [['can_host', 'I can host'], ['can_travel', "I'll come to you"]];
const TONES = [['vulnerable', 'Vulnerable'], ['playful', 'Playful'], ['mysterious', 'Mysterious'], ['direct', 'Direct']];
const FRESH_HINT = {
  tonight: "It's up for 12 hours. You can add more, up to 2 days.",
  week: "It's up for 7 days.",
  flexible: "It's up for 7 days. Renew it when it runs out.",
};
const WAITING = ['listening to what you said…', 'finding your words…', 'keeping it yours…'];
const NOTE_MAX = 200;
const CLARITY_MAX = 80;

const EMPTY = {
  age: '', gender: null, area: '', appearance: '',
  lookingFor: 'anyone', ageMin: '', ageMax: '',
  wants: [],
  when: 'tonight', hosting: null, publicFirst: false,
  note: '', want: '', dontWant: '',
  sound: '',
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
      {active && <Check size={rs(13)} color={T.primary} strokeWidth={3} />}
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

function Section({ n, title, sub, done, optional, children }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <View style={[s.num, done && s.numDone]}>
          {done ? <Check size={rs(12)} color="#fff" strokeWidth={3} /> : <Text style={s.numText}>{n}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.sectionTitle}>{title}{optional ? <Text style={s.optional}>  optional</Text> : null}</Text>
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
  const [phase, setPhase] = useState('form');      // 'form' | 'review'
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1000));
  const [ready, setReady] = useState(false);
  const set = (patch) => setA((cur) => ({ ...cur, ...patch }));

  const [writer, setWriter] = useState({ enabled: null, remaining: null });
  const [text, setText] = useState('');
  const [baseText, setBaseText] = useState('');   // what the review started from, to tell edits apart
  const [tone, setTone] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [aiText, setAiText] = useState('');      // last text the writer produced
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [posting, setPosting] = useState(false);
  const [ageGate, setAgeGate] = useState(false);
  const [waitIx, setWaitIx] = useState(0);
  const [sounds, setSounds] = useState(null);
  const [hearing, setHearing] = useState('');
  const preview = useAudioPlayer(null);

  const draft = useMemo(() => hookupDraft(a, seed), [a, seed]);
  const problem = formProblem(a);

  // ── Restore and save answers ────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const saved = JSON.parse(await AsyncStorage.getItem(SAVE_KEY) || 'null');
        if (saved?.a) setA({ ...EMPTY, ...saved.a, wants: Array.isArray(saved.a.wants) ? saved.a.wants : [] });
        if (saved?.phase === 'review') setPhase('review');
        if (typeof saved?.seed === 'number') setSeed(saved.seed);
        if (typeof saved?.text === 'string') setText(saved.text);
        if (typeof saved?.baseText === 'string') setBaseText(saved.baseText);
        if (typeof saved?.aiText === 'string') setAiText(saved.aiText);
        if (typeof saved?.tone === 'string') setTone(saved.tone);
        if (Array.isArray(saved?.drafts)) setDrafts(saved.drafts.slice(-4));
        const myAge = await AsyncStorage.getItem(MY_AGE_KEY);
        if (myAge && /^\d{2}$/.test(myAge)) setA((cur) => (cur.age ? cur : { ...cur, age: myAge }));
      } catch { /* corrupt or missing: start fresh */ }
      setReady(true);
    })();
    dispatch(fetchBalance());
    authedFetch('/guided/status').then(({ res, data }) => {
      setWriter(res.ok ? { enabled: !!data.enabled, remaining: data.remaining } : { enabled: false, remaining: null });
    }).catch(() => setWriter({ enabled: false, remaining: null }));
    authedFetch('/sounds').then(({ res, data }) => setSounds(res.ok ? data.sounds || [] : [])).catch(() => setSounds([]));
  }, [dispatch]);

  useEffect(() => {
    if (!ready) return undefined;
    const t = setTimeout(() => {
      const started = phase !== 'form' || !!text || JSON.stringify(a) !== JSON.stringify(EMPTY);
      (started
        ? AsyncStorage.setItem(SAVE_KEY, JSON.stringify({ started, a, phase, seed, text, baseText, aiText, tone, drafts }))
        : AsyncStorage.removeItem(SAVE_KEY)
      ).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [a, phase, seed, text, baseText, aiText, tone, drafts, ready]);

  // A sound preview stops when they leave the review.
  useEffect(() => { if (phase !== 'review' && hearing) { preview.pause(); setHearing(''); } }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const hear = useCallback((snd) => {
    if (hearing === snd.id) { preview.pause(); setHearing(''); return; }
    preview.replace({ uri: snd.url });
    preview.play();
    setHearing(snd.id);
  }, [hearing, preview]);

  // ── Phase change ────────────────────────────────────────────
  const fade = useRef(new Animated.Value(1)).current;
  const goTo = useCallback((next) => {
    Keyboard.dismiss();
    Animated.timing(fade, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
      setPhase(next);
      Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: true }).start();
    });
  }, [fade]);

  const toReview = () => {
    if (problem) return;
    // Keep their own edits; otherwise start from the live draft as it is now.
    if (!text.trim() || text === baseText) { setText(draft); setBaseText(draft); setAiText(''); }
    goTo('review');
  };

  const copy = async () => {
    await Clipboard.setStringAsync(phase === 'review' ? text : draft);
    showToast({ type: 'success', message: 'Copied. It stays anonymous wherever you paste it.' });
  };

  useEffect(() => {
    if (!generating) return undefined;
    const t = setInterval(() => setWaitIx((i) => (i + 1) % WAITING.length), 1800);
    return () => clearInterval(t);
  }, [generating]);

  // ── AI writer (optional rewording on the review) ────────────
  const generate = useCallback(async (withTone) => {
    setGenerating(true);
    setGenError('');
    try {
      const [lo, hi] = wantedRange(a);
      const { res, data } = await authedFetch('/guided/generate', {
        age: Number(a.age),
        gender: a.gender,
        area: a.area.trim(),
        appearance: a.appearance.trim() || null,
        looking_for: a.lookingFor,
        age_min: lo,
        age_max: hi,
        connection: a.wants,
        meet_when: a.when,
        hosting: a.hosting,
        public_first: a.publicFirst,
        secret: a.note.trim() || null,
        want: a.want.trim() || null,
        dont_want: a.dontWant.trim() || null,
        tone: withTone,
        previous: drafts,
      });
      if (res.status === 403 && isAgeGate(data)) { setAgeGate(true); return; }
      if (res.status === 503) { setWriter((w) => ({ ...w, enabled: false })); setGenError(detailText(data, '')); return; }
      if (!res.ok) { setGenError(detailText(data, "Couldn't find the words this time. Try again.")); return; }
      setText(data.confession);
      setBaseText(data.confession);
      setAiText(data.confession);
      setTone(data.tone);
      setDrafts((d) => [...d, data.confession].slice(-4));
      setWriter((w) => ({ ...w, remaining: data.remaining }));
    } catch {
      setGenError("Couldn't reach the writer. Check your connection and try again.");
    } finally {
      setGenerating(false);
    }
  }, [a, drafts]);

  // ── Publish ─────────────────────────────────────────────────
  const publish = useCallback(async () => {
    const body = text.trim();
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
            appearance: a.appearance.trim() || null,
            meet_when: a.when,
            hosting: a.hosting,
            public_first: a.publicFirst,
            want: a.want.trim() || null,
            dont_want: a.dontWant.trim() || null,
            tone: aiText ? tone : null,
            ai_generated: !!aiText,
            edited: body !== baseText.trim(),
          },
        },
        theme: 'desire',
        mood_tag: 'longing',
        sensitivity: 'mature',
        font_style: 'classic',
        publisher_opt_in: true,
        ...(a.sound ? { sound_id: a.sound } : {}),
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
  }, [a, aiText, baseText, text, tone, dispatch, navigation, showToast]);

  // ── Form ────────────────────────────────────────────────────
  const aboutDone = !problem;
  function renderForm() {
    return (
      <>
        <Section n={1} title="About me" sub="Only your age and area show on your card." done={aboutDone}>
          <View style={s.row}>
            <Field style={s.ageField} value={a.age} onChangeText={(v) => set({ age: digits(v) })} placeholder="Age" keyboardType="number-pad" accessibilityLabel="Your age" />
            <Field
              style={{ flex: 1 }}
              icon={<MapPin size={rs(16)} color={T.textSecondary} />}
              value={a.area}
              onChangeText={(v) => set({ area: v.slice(0, 60) })}
              placeholder="Neighbourhood or city"
              accessibilityLabel="Where you are"
            />
          </View>
          <View style={s.chips}>
            {GENDERS.map(([k, l]) => <Chip key={k} label={l} active={a.gender === k} onPress={() => set({ gender: a.gender === k ? null : k })} />)}
          </View>
          <Label optional>How they'd recognise you</Label>
          <Field value={a.appearance} onChangeText={(v) => set({ appearance: v.slice(0, 60) })} placeholder="Tall, curly hair, soft voice…" accessibilityLabel="Your appearance (optional)" />
        </Section>

        <Section n={2} title="Who I'm looking for" done={!!a.ageMin || !!a.ageMax || a.lookingFor !== 'anyone'}>
          <View style={s.chips}>
            {LOOKING.map(([k, l]) => <Chip key={k} label={l} active={a.lookingFor === k} onPress={() => set({ lookingFor: k })} />)}
          </View>
          <View style={s.row}>
            <Text style={s.inline}>Aged</Text>
            <Field style={s.ageField} value={a.ageMin} onChangeText={(v) => set({ ageMin: digits(v) })} placeholder="18" keyboardType="number-pad" accessibilityLabel="From this age" />
            <Text style={s.inline}>to</Text>
            <Field style={s.ageField} value={a.ageMax} onChangeText={(v) => set({ ageMax: digits(v) })} placeholder="any" keyboardType="number-pad" accessibilityLabel="Up to this age" />
          </View>
        </Section>

        <Section n={3} title="What I'm looking for" sub="Pick up to three." done={a.wants.length > 0}>
          <View style={s.chips}>
            {WANTS.map(([k, l]) => <Chip key={k} label={l} active={a.wants.includes(k)} onPress={() => set({ wants: toggleIn(a.wants, k, 3) })} />)}
          </View>
          {a.wants.includes('on our terms') && <Text style={s.hint}>Whatever you two agree on, never for money. Nobody pays anybody on Anonixx.</Text>}
        </Section>

        <Section n={4} title="When I'd like to meet" sub={FRESH_HINT[FRESH_FOR_WHEN[a.when]]} done={!!a.when}>
          <View style={s.chips}>
            {MEET_WHEN.map(([k, l]) => <Chip key={k} label={l} active={a.when === k} onPress={() => set({ when: k })} />)}
          </View>
          <View style={s.chips}>
            {HOSTING.map(([k, l]) => <Chip key={k} label={l} active={a.hosting === k} onPress={() => set({ hosting: a.hosting === k ? null : k })} />)}
            <Chip label="Somewhere public first" active={a.publicFirst} onPress={() => set({ publicFirst: !a.publicFirst })} />
          </View>
        </Section>

        <Section n={5} title="Anything else" optional done={!!(a.note.trim() || a.want.trim() || a.dontWant.trim())}>
          <View style={s.noteBox}>
            <TextInput
              style={s.noteInput}
              value={a.note}
              onChangeText={(v) => set({ note: v.slice(0, NOTE_MAX) })}
              placeholder="Something only you would say…"
              placeholderTextColor={T.textMute}
              multiline
              textAlignVertical="top"
            />
            <Text style={s.counter}>{NOTE_MAX - a.note.length}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.clarityText}>I want</Text>
            <Field style={{ flex: 1 }} value={a.want} onChangeText={(v) => set({ want: v.slice(0, CLARITY_MAX) })} placeholder="slow, then not so slow" accessibilityLabel="What you want (optional)" />
          </View>
          <View style={s.row}>
            <Text style={s.clarityText}>I don't want</Text>
            <Field style={{ flex: 1 }} value={a.dontWant} onChangeText={(v) => set({ dontWant: v.slice(0, CLARITY_MAX) })} placeholder="anything serious" accessibilityLabel="What you don't want (optional)" />
          </View>
          <View style={s.privacyRow}>
            <Lock size={rs(12)} color={T.textMute} />
            <Text style={s.privacy}>No names, numbers or socials. Link up is how you meet.</Text>
          </View>
        </Section>
      </>
    );
  }

  // ── Review ──────────────────────────────────────────────────
  const pickedSound = a.sound && sounds ? sounds.find((x) => x.id === a.sound) : null;
  function renderReview() {
    return (
      <View style={s.group}>
        <Text style={s.title}>This is how it reads.</Text>
        <Text style={s.sub}>Change any word. It stays anonymous either way.</Text>
        <LinearGradient colors={['#1d1018', '#120a10']} style={s.card}>
          <Text style={s.cardKicker}>your confession</Text>
          {generating ? (
            <View style={s.waiting}>
              <ActivityIndicator color={T.primary} />
              <Text style={s.waitingText}>{WAITING[waitIx]}</Text>
            </View>
          ) : (
            <TextInput
              style={s.cardInput}
              value={text}
              onChangeText={(v) => setText(v.slice(0, MAX_CHARS))}
              placeholder="Say it the way you'd whisper it to them…"
              placeholderTextColor={T.textMute}
              multiline
              textAlignVertical="top"
            />
          )}
          <Text style={[s.counter, { alignSelf: 'flex-end' }]}>{MAX_CHARS - text.length}</Text>
        </LinearGradient>
        {!!genError && <Text style={s.error}>{genError}</Text>}

        {writer.enabled && (
          <>
            <Label optional>Reword it for me</Label>
            <View style={s.chips}>
              {TONES.map(([k, l]) => (
                <Chip key={k} label={l} active={tone === k && !!aiText} onPress={() => { if (!generating) generate(k); }} />
              ))}
            </View>
            {writer.remaining != null && <Text style={s.hint}>{writer.remaining} rewordings left today.</Text>}
          </>
        )}

        <Label optional>A sound behind it</Label>
        {sounds === null ? <ActivityIndicator color={T.primary} /> : sounds.length === 0 ? (
          <Text style={s.hint}>No sounds yet. Yours goes out quiet, which works too.</Text>
        ) : (
          <View style={s.chips}>
            <Chip label="No sound" active={!a.sound} onPress={() => set({ sound: '' })} />
            {sounds.map((snd) => (
              <View key={snd.id} style={s.soundRow}>
                <Chip label={snd.title} active={a.sound === snd.id} onPress={() => set({ sound: snd.id })} />
                <TouchableOpacity onPress={() => hear(snd)} hitSlop={HIT_SLOP}>
                  <Text style={s.link}>{hearing === snd.id ? 'stop' : 'listen'}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        <Text style={s.hint}>{FRESH_HINT[FRESH_FOR_WHEN[a.when]]} Your Room and chats stay either way.{pickedSound ? `  ♪ ${pickedSound.title}` : ''}</Text>
      </View>
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

  const onReview = phase === 'review';
  const doneCount = [aboutDone, !!a.ageMin || !!a.ageMax || a.lookingFor !== 'anyone', a.wants.length > 0, !!a.when, !!(a.note.trim() || a.want.trim() || a.dontWant.trim())].filter(Boolean).length;
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={s.header}>
          <TouchableOpacity onPress={onReview ? () => goTo('form') : onBack} hitSlop={HIT_SLOP} accessibilityLabel="Back">
            <ChevronLeft size={rs(24)} color={T.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{onReview ? 'Ready to drop' : 'Link up'}</Text>
          <View style={s.progress}>
            {[0, 1, 2, 3, 4].map((i) => <View key={i} style={[s.seg, (onReview || i < doneCount) && s.segOn]} />)}
          </View>
        </View>

        {/* Live preview: rewrites itself as they answer. */}
        {!onReview && (
          <View style={s.previewWrap}>
            <LinearGradient colors={['#1d1018', '#120a10']} style={s.previewCard}>
              <View style={s.previewHead}>
                <Text style={s.cardKicker}>live preview</Text>
                <TouchableOpacity onPress={() => setSeed((x) => x + 1)} hitSlop={HIT_SLOP} style={s.reword} accessibilityLabel="Try different wording">
                  <RefreshCw size={rs(12)} color={T.textSecondary} />
                  <Text style={s.rewordText}>new wording</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={s.previewScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                <Text style={s.previewText}>{draft}</Text>
              </ScrollView>
            </LinearGradient>
          </View>
        )}

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: fade }}>
            {onReview ? renderReview() : renderForm()}
          </Animated.View>
        </ScrollView>

        <View style={s.footer}>
          <View style={s.footRow}>
            <TouchableOpacity style={s.copyBtn} onPress={copy} disabled={onReview ? !text.trim() : !!problem} activeOpacity={0.8} accessibilityLabel="Copy the confession">
              <Copy size={rs(16)} color={T.text} />
              <Text style={s.ghostText}>Copy</Text>
            </TouchableOpacity>
            {onReview ? (
              <TouchableOpacity
                style={[s.primaryBtn, (!text.trim() || posting || generating) && s.primaryOff]}
                onPress={publish}
                disabled={!text.trim() || posting || generating}
                activeOpacity={0.85}
              >
                {posting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Drop it · {POST_COST} coins</Text>}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[s.primaryBtn, !!problem && s.primaryOff]} onPress={toReview} disabled={!!problem} activeOpacity={0.85}>
                <Text style={s.primaryText}>Continue</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={s.footNote}>
            {onReview ? `18+ only. Balance ${coinBalance ?? 0}.` : problem || 'Everything else is optional.'}
            {onReview && coinBalance < POST_COST ? <Text style={s.link} onPress={() => navigation.navigate('Coins')}>  Top up</Text> : null}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  headerTitle: { color: T.text, fontFamily: 'DMSans-Bold', fontSize: FONT.md },
  progress: { flex: 1, flexDirection: 'row', gap: rs(5), marginLeft: SPACING.sm },
  seg: { flex: 1, height: rs(3), borderRadius: rs(2), backgroundColor: T.borderStrong },
  segOn: { backgroundColor: T.primary },

  previewWrap: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
  previewCard: { borderRadius: RADIUS.lg, borderWidth: 1, borderColor: T.primaryBorder, paddingHorizontal: SPACING.md, paddingVertical: rp(12), gap: rp(6) },
  previewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewScroll: { maxHeight: rs(96) },
  previewText: { color: T.text, fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.md, lineHeight: rf(22) },
  reword: { flexDirection: 'row', alignItems: 'center', gap: rs(4) },
  rewordText: { color: T.textSecondary, fontFamily: 'DMSans-SemiBold', fontSize: FONT.xs },

  scroll: { padding: SPACING.md, paddingTop: SPACING.xs, paddingBottom: SPACING.xl, gap: SPACING.md },
  section: { borderRadius: RADIUS.lg, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, padding: SPACING.md, gap: SPACING.sm, marginBottom: SPACING.md },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  num: { width: rs(24), height: rs(24), borderRadius: rs(12), borderWidth: 1, borderColor: T.primaryBorder, alignItems: 'center', justifyContent: 'center', marginTop: rs(1) },
  numDone: { backgroundColor: T.primary, borderColor: T.primary },
  numText: { color: T.primary, fontFamily: 'DMSans-Bold', fontSize: FONT.xs },
  sectionTitle: { color: T.text, fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.lg },
  sectionSub: { color: T.textMute, fontFamily: 'DMSans-Regular', fontSize: FONT.xs, marginTop: rs(2), lineHeight: rf(17) },

  title: { color: T.text, fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.xxl, lineHeight: rf(36) },
  sub: { color: T.textSecondary, fontFamily: 'DMSans-Regular', fontSize: FONT.sm, lineHeight: rf(20), marginBottom: SPACING.sm },

  group: { gap: SPACING.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  inline: { color: T.textSecondary, fontFamily: 'DMSans-Regular', fontSize: FONT.sm },
  label: { color: T.text, fontFamily: 'DMSans-SemiBold', fontSize: FONT.sm, marginTop: SPACING.sm },
  optional: { color: T.textMute, fontFamily: 'DMSans-Regular', fontSize: FONT.xs },
  hint: { color: T.textMute, fontFamily: 'DMSans-Regular', fontSize: FONT.xs, lineHeight: rf(17) },
  error: { color: T.warn, fontFamily: 'DMSans-Regular', fontSize: FONT.sm },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: rs(5),
    paddingHorizontal: rp(14), paddingVertical: rp(9), borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: T.borderStrong, backgroundColor: T.background,
  },
  chipOn: { borderColor: T.primary, backgroundColor: T.primaryDim },
  chipText: { color: T.textSecondary, fontFamily: 'DMSans-SemiBold', fontSize: FONT.sm },
  chipTextOn: { color: T.text },
  soundRow: { flexDirection: 'row', alignItems: 'center', gap: rp(6) },

  field: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: rp(14), borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.borderStrong, backgroundColor: T.background,
  },
  fieldInput: { flex: 1, color: T.text, fontFamily: 'DMSans-Regular', fontSize: FONT.md, paddingVertical: rp(12) },
  ageField: { width: rs(78) },
  clarityText: { width: rs(96), color: T.text, fontFamily: 'DMSans-Regular', fontSize: FONT.sm },

  noteBox: { borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.primaryBorder, backgroundColor: T.primaryTint, padding: rp(12) },
  noteInput: { minHeight: rs(80), color: T.text, fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.md, lineHeight: rf(23) },
  counter: { color: T.textMute, fontFamily: 'DMSans-Regular', fontSize: FONT.xs, textAlign: 'right' },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
  privacy: { flex: 1, color: T.textMute, fontFamily: 'DMSans-Regular', fontSize: FONT.xs },

  card: { borderRadius: RADIUS.xl, borderWidth: 1, borderColor: T.primaryBorder, padding: SPACING.lg, gap: SPACING.sm },
  cardKicker: { color: T.primary, fontFamily: 'DMSans-Bold', fontSize: FONT.xs, letterSpacing: 1.5 },
  cardInput: { minHeight: rs(170), color: T.text, fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.lg, lineHeight: rf(28) },
  waiting: { minHeight: rs(170), alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  waitingText: { color: T.textSecondary, fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.md },

  footer: { padding: SPACING.md, paddingTop: SPACING.sm, gap: SPACING.xs, borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.background },
  footRow: { flexDirection: 'row', gap: SPACING.sm },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(6),
    height: BUTTON_HEIGHT, paddingHorizontal: rp(18), borderRadius: RADIUS.full, borderWidth: 1, borderColor: T.borderStrong,
  },
  ghostText: { color: T.text, fontFamily: 'DMSans-SemiBold', fontSize: FONT.sm },
  primaryBtn: { flex: 1, height: BUTTON_HEIGHT, borderRadius: RADIUS.full, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  primaryOff: { opacity: 0.4 },
  primaryText: { color: '#fff', fontFamily: 'DMSans-Bold', fontSize: FONT.md },
  footNote: { color: T.textSecondary, fontFamily: 'DMSans-Regular', fontSize: FONT.xs, textAlign: 'center' },
  link: { color: T.primary, fontFamily: 'DMSans-Bold' },
});
