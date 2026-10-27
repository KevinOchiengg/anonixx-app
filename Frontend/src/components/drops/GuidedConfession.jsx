/**
 * GuidedConfession.jsx
 *
 * The hookup half of the compose screen: five short questions, asked one at a
 * time like a private conversation, an optional sound to play behind it, then a reveal where the AI writer
 * (POST /guided/generate) turns the answers into a confession the poster can
 * re-tone, regenerate, edit and drop.
 *
 * Answers, the step, and the confession draft (generated or hand-edited) are
 * saved to AsyncStorage as they change, so going back a step, or leaving and
 * coming back, never loses anything.
 * If the writer is off or fails, the poster is told and writes it themselves;
 * nothing is filled in from a template behind their back.
 *
 * Posting goes through POST /drops (kind="hookup") exactly like before, so the
 * age gate, coin cost, contact filter and moderation all still apply.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Animated,
  ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer } from 'expo-audio';
import { useDispatch, useSelector } from 'react-redux';
import { ChevronLeft, MapPin, Pencil, RefreshCw, Check, Lock } from 'lucide-react-native';

import { rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { countryHeader } from '../../utils/country';
import { awardMilestone, fetchBalance } from '../../store/slices/coinsSlice';
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
const CRAVINGS = [['warmth', 'Warmth'], ['attention', 'Attention'], ['intimacy', 'Intimacy'], ['chemistry', 'Chemistry'], ['companionship', 'Companionship']];
const LOOKING = [['woman', 'Women'], ['man', 'Men'], ['anyone', 'Anyone']];
const CONNECTION = [['casual', 'Casual'], ['dating', 'Dating'], ['company', 'Company'], ['discreet', 'Discreet'], ['adventure', 'Adventure'], ['friendship', 'Friendship']];
const GENDERS = [['woman', 'Woman'], ['man', 'Man'], ['other', 'Other']];
const TRAITS = [['sweet', 'Sweet'], ['playful', 'Playful'], ['shy', 'Shy'], ['adventurous', 'Adventurous'], ['affectionate', 'Affectionate'], ['bold', 'Bold'], ['curious', 'Curious'], ['calm', 'Calm']];
const HOSTING = [['can_host', 'I can host'], ['can_travel', "I'll come to you"], ['either', 'Either works'], ['decide', "Let's decide together"]];
// How long the post stays findable in the feed and in Near (Backend FRESH_WINDOWS).
// Running out only ends discovery: Rooms, chats and people already let in stay.
const FRESH = [['tonight', 'Tonight'], ['weekend', 'This weekend'], ['week', 'This week'], ['flexible', 'No rush']];
const FRESH_HINT = {
  tonight: 'Up for 12 hours. You can add more, up to 2 days.',
  weekend: 'Up until Sunday night.',
  week: 'Up for 7 days.',
  flexible: 'Up for 7 days. Renew it when it runs out.',
};
const TONES = [['vulnerable', 'Vulnerable'], ['playful', 'Playful'], ['mysterious', 'Mysterious'], ['direct', 'Direct']];
const HOSTING_TAG = { can_host: 'can host', can_travel: 'can travel', either: 'host or travel' };

const STEPS = [
  { q: "What have you been craving lately?", sub: 'No one sees this part. Just be honest.' },
  { q: 'Who would you love to find?', sub: 'Your age, theirs, and where they can find you.' },
  { q: 'What makes you, you?', sub: 'Pick up to three. Only what feels true.' },
  { q: "Tell us something they wouldn't know about you.", sub: 'A small, real thing. It is what makes yours different from everyone else\'s.' },
  { q: "If the chemistry feels right, what's possible?", sub: 'Only what you are comfortable with. You can change your mind later.' },
  { q: 'Want a sound behind it?', sub: 'Optional. It plays softly while they read yours.' },
];
const REVEAL = STEPS.length;

const WAITING = [
  'listening to what you said…',
  'finding your words…',
  'keeping it yours…',
];

const EMPTY = {
  craving: null, cravingCustom: '',
  lookingFor: 'anyone', ageMin: '', ageMax: '', area: '', connection: [],
  age: '', gender: null, traits: [],
  secret: '',
  hosting: null, publicFirst: false,
  want: '', dontWant: '',
  sound: '',
};
// The optional "I want / I don't want" lines, same cap as the API.
const CLARITY_MAX = 80;

const digits = (v) => v.replace(/\D/g, '').slice(0, 2);
const toggleIn = (list, v, max) => (list.includes(v) ? list.filter((x) => x !== v) : list.length < max ? [...list, v] : list);

function stepProblem(i, a) {
  if (i === 0) return !a.craving || (a.craving === 'custom' && !a.cravingCustom.trim()) ? 'Pick one, or say it in your own words.' : '';
  if (i === 1) {
    if (!a.area.trim()) return 'Add where you are.';
    const age = Number(a.age);
    if (!a.age) return 'Add your age.';
    if (age < 18) return 'You have to be 18 or older to post here.';
    if (age > 99) return 'Enter a real age.';
    const lo = Number(a.ageMin), hi = Number(a.ageMax);
    if ((a.ageMin && lo < 18) || (a.ageMax && hi < 18)) return 'Everyone here is 18+, so start at 18.';
    if (a.ageMin && a.ageMax && lo > hi) return 'The first age is higher than the second.';
    return '';
  }
  return '';
}

// The age they want: one age ("30") or a range ("28–35"). One box filled = that exact age.
const wantedRange = (a) => {
  const lo = a.ageMin ? Number(a.ageMin) : null;
  const hi = a.ageMax ? Number(a.ageMax) : null;
  return [lo ?? hi, hi ?? lo];
};
const wantedTag = (a) => {
  const [lo, hi] = wantedRange(a);
  return lo == null ? '' : lo === hi ? ` ${lo}` : ` ${lo}–${hi}`;
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

export default function GuidedConfession({ navigation, onBack }) {
  const { showToast } = useToast();
  const dispatch = useDispatch();
  const coinBalance = useSelector((state) => state.coins.balance);

  const [a, setA] = useState(EMPTY);
  const [step, setStep] = useState(0);            // 0..4 questions, 5 sound, 6 reveal
  const [ready, setReady] = useState(false);
  const set = (patch) => setA((cur) => ({ ...cur, ...patch }));

  const [writer, setWriter] = useState({ enabled: null, remaining: null });
  const [text, setText] = useState('');
  const [tone, setTone] = useState('vulnerable');
  const [drafts, setDrafts] = useState([]);
  const [aiText, setAiText] = useState('');      // last text the writer produced, to tell edits apart
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [posting, setPosting] = useState(false);
  const [fresh, setFresh] = useState('tonight');
  const [ageGate, setAgeGate] = useState(false);
  const [waitIx, setWaitIx] = useState(0);
  const [sounds, setSounds] = useState(null);
  const [hearing, setHearing] = useState('');
  const preview = useAudioPlayer(null);

  // ── Restore and save answers ────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const saved = JSON.parse(await AsyncStorage.getItem(SAVE_KEY) || 'null');
        if (saved?.a) setA({ ...EMPTY, ...saved.a });
        if (typeof saved?.step === 'number') setStep(Math.min(saved.step, REVEAL));
        if (typeof saved?.text === 'string') setText(saved.text);
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

  // A sound preview stops as soon as the poster leaves the sound step.
  useEffect(() => { if (step !== REVEAL - 1 && hearing) { preview.pause(); setHearing(''); } }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  const hear = useCallback((snd) => {
    if (hearing === snd.id) { preview.pause(); setHearing(''); return; }
    preview.replace({ uri: snd.url });
    preview.play();
    setHearing(snd.id);
  }, [hearing, preview]);

  useEffect(() => {
    if (!ready) return undefined;
    const t = setTimeout(() => {
      const started = step > 0 || !!text || JSON.stringify(a) !== JSON.stringify(EMPTY);
      (started
        ? AsyncStorage.setItem(SAVE_KEY, JSON.stringify({ started, a, step, text, aiText, tone, drafts }))
        : AsyncStorage.removeItem(SAVE_KEY)
      ).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [a, step, text, aiText, tone, drafts, ready]);

  // ── Step transition ─────────────────────────────────────────
  const fade = useRef(new Animated.Value(1)).current;
  const goTo = useCallback((next) => {
    Keyboard.dismiss();
    Animated.timing(fade, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
      setStep(next);
      Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: true }).start();
    });
  }, [fade]);

  useEffect(() => {
    if (!generating) return undefined;
    const t = setInterval(() => setWaitIx((i) => (i + 1) % WAITING.length), 1800);
    return () => clearInterval(t);
  }, [generating]);

  // ── Writer ──────────────────────────────────────────────────
  const generate = useCallback(async (withTone = tone) => {
    setGenerating(true);
    setGenError('');
    setEditing(false);
    try {
      const { res, data } = await authedFetch('/guided/generate', {
        craving: a.craving === 'custom' ? null : a.craving,
        craving_custom: a.craving === 'custom' ? a.cravingCustom.trim() : null,
        age: Number(a.age),
        gender: a.gender,
        area: a.area.trim(),
        looking_for: a.lookingFor,
        age_min: wantedRange(a)[0],
        age_max: wantedRange(a)[1],
        connection: a.connection,
        traits: a.traits,
        secret: a.secret.trim() || null,
        hosting: a.hosting,
        public_first: a.publicFirst,
        want: a.want.trim() || null,
        dont_want: a.dontWant.trim() || null,
        tone: withTone,
        previous: drafts,
      });
      if (res.status === 403 && isAgeGate(data)) { setAgeGate(true); return; }
      if (res.status === 503) { setWriter((w) => ({ ...w, enabled: false })); setGenError(detailText(data, '')); return; }
      if (!res.ok) { setGenError(detailText(data, "Couldn't find the words this time. Try again.")); return; }
      setText(data.confession);
      setAiText(data.confession);
      setTone(data.tone);
      setDrafts((d) => [...d, data.confession].slice(-4));
      setWriter((w) => ({ ...w, remaining: data.remaining }));
    } catch {
      setGenError("Couldn't reach the writer. Check your connection and try again.");
    } finally {
      setGenerating(false);
    }
  }, [a, drafts, tone]);

  // First arrival at the reveal writes the first draft on its own.
  useEffect(() => {
    if (step === REVEAL && writer.enabled && !text && !generating && !genError) generate();
  }, [step, writer.enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Publish ─────────────────────────────────────────────────
  const publish = useCallback(async () => {
    const body = text.trim();
    if (!body) { showToast({ type: 'warning', message: 'Say something first. Even one honest line.' }); return; }
    setPosting(true);
    try {
      const { res, data } = await authedFetch('/drops', {
        kind: 'hookup',
        confession: body,
        hookup: {
          age: Number(a.age),
          ...(a.gender ? { gender: a.gender } : {}),
          area: a.area.trim(),
          looking_for: a.lookingFor,
          ...(wantedRange(a)[0] ? { age_min: wantedRange(a)[0], age_max: wantedRange(a)[1] } : {}),
          vibes: a.connection,
          fresh_window: fresh,
          guided: {
            craving: a.craving === 'custom' ? null : a.craving,
            craving_custom: a.craving === 'custom' ? a.cravingCustom.trim() : null,
            traits: a.traits,
            hosting: a.hosting,
            public_first: a.publicFirst,
            want: a.want.trim() || null,
            dont_want: a.dontWant.trim() || null,
            tone: aiText ? tone : null,
            ai_generated: !!aiText,
            edited: !!aiText && body !== aiText.trim(),
          },
        },
        theme: 'desire',
        mood_tag: 'longing',
        sensitivity: 'mature',
        font_style: 'bold-tease',
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
  }, [a, aiText, text, tone, dispatch, navigation, showToast]);

  // ── Render helpers ──────────────────────────────────────────
  const problem = step < REVEAL ? stepProblem(step, a) : '';
  const back = () => (step === 0 ? onBack() : goTo(step - 1));
  const next = () => { if (!problem) goTo(step + 1); };

  const tags = [
    `${a.age || '—'}${a.gender && a.gender !== 'other' ? ` · ${a.gender}` : ''}`,
    a.area.trim() || null,
    `into ${a.lookingFor === 'anyone' ? 'anyone' : a.lookingFor === 'woman' ? 'women' : 'men'}${wantedTag(a)}`,
    HOSTING_TAG[a.hosting] || null,
    a.publicFirst ? 'public first' : null,
  ].filter(Boolean);
  const pickedSound = a.sound && sounds ? sounds.find((x) => x.id === a.sound) : null;

  function renderStep() {
    switch (step) {
      case 0: return (
        <View style={s.chips}>
          {CRAVINGS.map(([k, l]) => <Chip key={k} label={l} active={a.craving === k} onPress={() => set({ craving: k })} />)}
          <Chip label="Something else" active={a.craving === 'custom'} onPress={() => set({ craving: 'custom' })} />
          {a.craving === 'custom' && (
            <Field
              style={{ width: '100%', marginTop: SPACING.xs }}
              value={a.cravingCustom}
              onChangeText={(v) => set({ cravingCustom: v.slice(0, 40) })}
              placeholder="Say it in a few words"
              autoFocus
            />
          )}
        </View>
      );
      case 1: return (
        <View style={s.group}>
          <Label>I'm drawn to</Label>
          <View style={s.chips}>
            {LOOKING.map(([k, l]) => <Chip key={k} label={l} active={a.lookingFor === k} onPress={() => set({ lookingFor: k })} />)}
          </View>
          <View style={s.ages}>
            <Text style={s.agesText}>I'm</Text>
            <Field style={s.rangeField} value={a.age} onChangeText={(v) => set({ age: digits(v) })} placeholder="24" keyboardType="number-pad" accessibilityLabel="Your age" />
            <Text style={s.agesText}>years old, looking for</Text>
            <Field style={s.rangeField} value={a.ageMin} onChangeText={(v) => set({ ageMin: digits(v) })} placeholder="30" keyboardType="number-pad" accessibilityLabel="The age you're looking for" />
            <Text style={s.agesText}>to</Text>
            <Field style={s.rangeField} value={a.ageMax} onChangeText={(v) => set({ ageMax: digits(v) })} placeholder="any" keyboardType="number-pad" accessibilityLabel="Up to this age (optional)" />
          </View>
          <Text style={s.hint}>Your age shows on your card. Fill one box for one age, both for a range, or leave theirs empty for anyone 18+.</Text>
          <Label>Where they can find you</Label>
          <Field
            icon={<MapPin size={rs(16)} color={T.textSecondary} />}
            value={a.area}
            onChangeText={(v) => set({ area: v.slice(0, 60) })}
            placeholder="A neighbourhood or city"
          />
          <Text style={s.hint}>A town or neighbourhood, like Westlands or Kisumu. That's where people browsing Near find you, even if you're visiting. Never your exact address, and your profile location doesn't change.</Text>
          <Label optional>What kind of connection</Label>
          <View style={s.chips}>
            {CONNECTION.map(([k, l]) => <Chip key={k} label={l} active={a.connection.includes(k)} onPress={() => set({ connection: toggleIn(a.connection, k, 3) })} />)}
          </View>
        </View>
      );
      case 2: return (
        <View style={s.group}>
          <Label optional>I am</Label>
          <View style={s.chips}>
            {GENDERS.map(([k, l]) => <Chip key={k} label={l} active={a.gender === k} onPress={() => set({ gender: a.gender === k ? null : k })} />)}
          </View>
          <Label optional>{`I'm  ·  ${a.traits.length}/3`}</Label>
          <View style={s.chips}>
            {TRAITS.map(([k, l]) => <Chip key={k} label={l} active={a.traits.includes(k)} onPress={() => set({ traits: toggleIn(a.traits, k, 3) })} />)}
          </View>
        </View>
      );
      case 3: return (
        <View style={s.group}>
          <View style={s.secretBox}>
            <TextInput
              style={s.secretInput}
              value={a.secret}
              onChangeText={(v) => set({ secret: v.slice(0, 200) })}
              placeholder="I hum when I cook. I've never been kissed in the rain…"
              placeholderTextColor={T.textMute}
              multiline
              textAlignVertical="top"
            />
            <Text style={s.counter}>{200 - a.secret.length}</Text>
          </View>
          <View style={s.privacyRow}>
            <Lock size={rs(12)} color={T.textMute} />
            <Text style={s.privacy}>No names, numbers or socials. This only shapes your confession.</Text>
          </View>
        </View>
      );
      case 4: return (
        <View style={s.group}>
          <View style={s.chips}>
            {HOSTING.map(([k, l]) => <Chip key={k} label={l} active={a.hosting === k} onPress={() => set({ hosting: a.hosting === k ? null : k })} />)}
          </View>
          <TouchableOpacity style={s.toggleRow} onPress={() => set({ publicFirst: !a.publicFirst })} activeOpacity={0.8}>
            <View style={[s.box, a.publicFirst && s.boxOn]}>{a.publicFirst && <Check size={rs(12)} color="#fff" strokeWidth={3} />}</View>
            <Text style={s.toggleText}>Somewhere public first</Text>
          </TouchableOpacity>
          <Label optional>Say it plainly</Label>
          <View style={s.clarityRow}>
            <Text style={s.clarityText}>I want</Text>
            <Field style={s.clarityField} value={a.want} onChangeText={(v) => set({ want: v.slice(0, CLARITY_MAX) })} placeholder="slow, then not so slow" accessibilityLabel="What you want" />
          </View>
          <View style={s.clarityRow}>
            <Text style={s.clarityText}>I don't want</Text>
            <Field style={s.clarityField} value={a.dontWant} onChangeText={(v) => set({ dontWant: v.slice(0, CLARITY_MAX) })} placeholder="anything serious" accessibilityLabel="What you don't want" />
          </View>
          <Text style={s.hint}>Nobody pays anybody on Anonixx. Link up is how you meet.</Text>
        </View>
      );
      case 5: return (
        <View style={s.group}>
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
        </View>
      );
      default: return null;
    }
  }

  function renderReveal() {
    const writerOff = writer.enabled === false;
    return (
      <View style={s.group}>
        <LinearGradient colors={['#1d1018', '#120a10']} style={s.card}>
          <Text style={s.cardKicker}>your confession</Text>
          {generating ? (
            <View style={s.waiting}>
              <ActivityIndicator color={T.primary} />
              <Text style={s.waitingText}>{WAITING[waitIx]}</Text>
            </View>
          ) : editing || writerOff || (!text && genError) ? (
            <TextInput
              style={s.cardInput}
              value={text}
              onChangeText={(v) => setText(v.slice(0, MAX_CHARS))}
              placeholder="Say it the way you'd whisper it to them…"
              placeholderTextColor={T.textMute}
              multiline
              autoFocus={editing}
              textAlignVertical="top"
            />
          ) : (
            <Text style={s.cardText}>{text}</Text>
          )}
          <View style={s.tags}>
            {tags.map((t, i) => (
              <View key={i} style={s.tag}>
                {i === 1 && <MapPin size={rs(10)} color={T.textSecondary} />}
                <Text style={s.tagText}>{t}</Text>
              </View>
            ))}
            {pickedSound && <View style={s.tag}><Text style={s.tagText}>♪ {pickedSound.title}</Text></View>}
          </View>
        </LinearGradient>

        {!!genError && <Text style={s.error}>{genError}</Text>}
        <Text style={s.label}>Keep it up for</Text>
        <View style={s.chips}>
          {FRESH.map(([k, l]) => <Chip key={k} label={l} active={fresh === k} onPress={() => setFresh(k)} />)}
        </View>
        <Text style={s.hint}>{FRESH_HINT[fresh]} Your Room and chats stay either way.</Text>
        {writerOff && <Text style={s.hint}>Write it yourself. Your answers are saved above if you want to look back.</Text>}

        {!writerOff && writer.enabled !== null && (
          <>
            <Text style={s.label}>Make it more me</Text>
            <View style={s.chips}>
              {TONES.map(([k, l]) => (
                <Chip key={k} label={l} active={tone === k && !!aiText} onPress={() => { if (!generating) { setTone(k); generate(k); } }} />
              ))}
            </View>
            <View style={s.actions}>
              <TouchableOpacity style={s.ghostBtn} onPress={() => setEditing((e) => !e)} disabled={generating || !text} activeOpacity={0.8}>
                <Pencil size={rs(15)} color={T.text} />
                <Text style={s.ghostText}>{editing ? 'Done' : 'Edit'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.ghostBtn} onPress={() => generate()} disabled={generating} activeOpacity={0.8}>
                <RefreshCw size={rs(15)} color={T.text} />
                <Text style={s.ghostText}>Regenerate</Text>
              </TouchableOpacity>
            </View>
            {writer.remaining != null && <Text style={s.hint}>{writer.remaining} drafts left today.</Text>}
          </>
        )}
        <Text style={[s.counter, { alignSelf: 'flex-end' }]}>{MAX_CHARS - text.length}</Text>
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

  const onReveal = step === REVEAL;
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <TouchableOpacity onPress={back} hitSlop={HIT_SLOP} accessibilityLabel="Back">
            <ChevronLeft size={rs(24)} color={T.text} />
          </TouchableOpacity>
          <View style={s.progress}>
            {STEPS.map((_, i) => <View key={i} style={[s.seg, i <= step && s.segOn]} />)}
          </View>
          <Text style={s.stepNum}>{onReveal ? '' : `${step + 1}/${STEPS.length}`}</Text>
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [rs(12), 0] }) }] }}>
            <Text style={s.question}>{onReveal ? 'This is how it reads.' : STEPS[step].q}</Text>
            <Text style={s.sub}>{onReveal ? 'Tone it, tweak it, or say it yourself. It stays anonymous either way.' : STEPS[step].sub}</Text>
            {onReveal ? renderReveal() : renderStep()}
          </Animated.View>
        </ScrollView>

        <View style={s.footer}>
          {onReveal ? (
            <>
              <TouchableOpacity
                style={[s.primaryBtn, (!text.trim() || posting || generating) && s.primaryOff]}
                onPress={publish}
                disabled={!text.trim() || posting || generating}
                activeOpacity={0.85}
              >
                {posting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Drop it · {POST_COST} coins</Text>}
              </TouchableOpacity>
              <Text style={s.footNote}>
                18+ only. Balance {coinBalance ?? 0}.
                {coinBalance < POST_COST ? <Text style={s.link} onPress={() => navigation.navigate('Coins')}>  Top up</Text> : null}
              </Text>
            </>
          ) : (
            <>
              <TouchableOpacity style={[s.primaryBtn, !!problem && s.primaryOff]} onPress={next} disabled={!!problem} activeOpacity={0.85}>
                <Text style={s.primaryText}>{step === REVEAL - 1 ? (a.sound ? 'Reveal it' : 'Skip and reveal') : step === 3 && !a.secret.trim() ? 'Skip' : 'Next'}</Text>
              </TouchableOpacity>
              {!!problem && <Text style={s.footNote}>{problem}</Text>}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  progress: { flex: 1, flexDirection: 'row', gap: rs(5) },
  soundRow: { flexDirection: 'row', alignItems: 'center', gap: rp(6) },
  seg: { flex: 1, height: rs(3), borderRadius: rs(2), backgroundColor: T.borderStrong },
  segOn: { backgroundColor: T.primary },
  stepNum: { width: rs(28), textAlign: 'right', color: T.textMute, fontFamily: 'DMSans-SemiBold', fontSize: FONT.xs },

  scroll: { padding: SPACING.md, paddingTop: SPACING.lg, paddingBottom: SPACING.xl },
  question: { color: T.text, fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.xxl, lineHeight: rf(36) },
  sub: { color: T.textSecondary, fontFamily: 'DMSans-Regular', fontSize: FONT.sm, lineHeight: rf(20), marginTop: SPACING.sm, marginBottom: SPACING.lg },

  group: { gap: SPACING.sm },
  label: { color: T.text, fontFamily: 'DMSans-SemiBold', fontSize: FONT.sm, marginTop: SPACING.sm },
  optional: { color: T.textMute, fontFamily: 'DMSans-Regular', fontSize: FONT.xs },
  hint: { color: T.textMute, fontFamily: 'DMSans-Regular', fontSize: FONT.xs, lineHeight: rf(17) },
  error: { color: T.warn, fontFamily: 'DMSans-Regular', fontSize: FONT.sm },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: rs(5),
    paddingHorizontal: rp(14), paddingVertical: rp(10), borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: T.borderStrong, backgroundColor: T.surface,
  },
  chipOn: { borderColor: T.primary, backgroundColor: T.primaryDim },
  chipText: { color: T.textSecondary, fontFamily: 'DMSans-SemiBold', fontSize: FONT.sm },
  chipTextOn: { color: T.text },

  field: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: rp(14), borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.borderStrong, backgroundColor: T.surface,
  },
  fieldInput: { flex: 1, color: T.text, fontFamily: 'DMSans-Regular', fontSize: FONT.md, paddingVertical: rp(12) },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  ages: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.sm },
  agesText: { color: T.text, fontFamily: 'DMSans-Regular', fontSize: FONT.md },
  rangeField: { width: rs(76) },
  rangeTo: { color: T.textSecondary, fontFamily: 'DMSans-Regular', fontSize: FONT.sm },
  youRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  ageField: { width: rs(84) },

  secretBox: { borderRadius: RADIUS.lg, borderWidth: 1, borderColor: T.primaryBorder, backgroundColor: T.primaryTint, padding: SPACING.md },
  secretInput: { minHeight: rs(120), color: T.text, fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.lg, lineHeight: rf(27) },
  counter: { color: T.textMute, fontFamily: 'DMSans-Regular', fontSize: FONT.xs, textAlign: 'right' },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
  privacy: { flex: 1, color: T.textMute, fontFamily: 'DMSans-Regular', fontSize: FONT.xs },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md },
  box: { width: rs(20), height: rs(20), borderRadius: rs(6), borderWidth: 1.5, borderColor: T.borderStrong, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: T.primary, borderColor: T.primary },
  toggleText: { color: T.text, fontFamily: 'DMSans-Regular', fontSize: FONT.md },
  clarityRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  clarityText: { width: rs(100), color: T.text, fontFamily: 'DMSans-Regular', fontSize: FONT.md },
  clarityField: { flex: 1 },

  card: { borderRadius: RADIUS.xl, borderWidth: 1, borderColor: T.primaryBorder, padding: SPACING.lg, gap: SPACING.md },
  cardKicker: { color: T.primary, fontFamily: 'DMSans-Bold', fontSize: FONT.xs, letterSpacing: 1.5 },
  cardText: { color: T.text, fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.lg, lineHeight: rf(28) },
  cardInput: { minHeight: rs(150), color: T.text, fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.lg, lineHeight: rf(28) },
  waiting: { minHeight: rs(150), alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  waitingText: { color: T.textSecondary, fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.md },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(6) },
  tag: { flexDirection: 'row', alignItems: 'center', gap: rs(4), paddingHorizontal: rp(10), paddingVertical: rp(4), borderRadius: RADIUS.full, backgroundColor: 'rgba(255,255,255,0.06)' },
  tagText: { color: T.textSecondary, fontFamily: 'DMSans-SemiBold', fontSize: FONT.xs },

  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  ghostBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(6),
    height: rs(44), borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.borderStrong,
  },
  ghostText: { color: T.text, fontFamily: 'DMSans-SemiBold', fontSize: FONT.sm },

  footer: { padding: SPACING.md, paddingTop: SPACING.sm, gap: SPACING.xs, borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.background },
  primaryBtn: { height: BUTTON_HEIGHT, borderRadius: RADIUS.full, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  primaryOff: { opacity: 0.4 },
  primaryText: { color: '#fff', fontFamily: 'DMSans-Bold', fontSize: FONT.md },
  footNote: { color: T.textSecondary, fontFamily: 'DMSans-Regular', fontSize: FONT.xs, textAlign: 'center' },
  link: { color: T.primary, fontFamily: 'DMSans-Bold' },
});
