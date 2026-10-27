/**
 * SearchScreen — Discover (mirrors Web/components/SearchPage.tsx; Backend api/v1/discover.py).
 *   Near     fresh Link Ups and listed Rooms in a place you pick, one card per person.
 *            Adults only: the server opens it for age-verified viewers in full content
 *            mode, so in this (safe-mode) build it explains that instead of showing posts.
 *   Stories  confessions: latest, unanswered, trending, moods, topics, Surprise me.
 * Typed text is read on the server (English, Swahili, Sheng) into chips you can remove.
 * "Discover in" and recent searches stay on this device; browsing somewhere never
 * changes the location on your own posts.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, StatusBar,
  ActivityIndicator, ScrollView, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Clock, Search, X, MapPin, Shuffle } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import DropCard from '../../components/feed/DropCard';
import { API_BASE_URL } from '../../config/api';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import T from '../../utils/theme';

const HISTORY_KEY = '@anonixx_search_history';
const WHERE_KEY   = '@anonixx_discover_in';
const TAB_KEY     = '@anonixx_discover_tab';
const MAX_HISTORY = 8;
const SCOPES = [
  { id: 'close', label: 'Close by' }, { id: 'area', label: 'My area' },
  { id: 'country', label: 'My country' }, { id: 'anywhere', label: 'Anywhere' },
];
const WIDER = { close: 'area', area: 'country', country: 'anywhere', anywhere: null };
const STORY_TABS = [['latest', 'Latest'], ['unanswered', 'Unanswered'], ['trending', 'Trending']];
const FRESH = [['tonight', 'Tonight'], ['weekend', 'This weekend'], ['week', 'This week']];
const HOSTING_TAG = { can_host: 'can host', can_travel: 'can travel', either: 'host or travel' };
const ANYWHERE = { scope: 'anywhere', country: '', county: '', sub: '' };

async function get(path) {
  const token = await AsyncStorage.getItem('token');
  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || 'Something went wrong');
  return data;
}

function placeLabel(p) {
  if (!p || p.scope === 'anywhere') return 'Anywhere';
  if (p.scope === 'country') return p.country || 'Pick a country';
  if (p.scope === 'close') return p.sub ? `${p.sub}${p.county ? `, ${p.county}` : ''}` : 'Pick your area';
  return p.county || p.country || 'Pick a place';
}

function placeParams(p) {
  const q = new URLSearchParams({ scope: p.scope });
  if (p.scope !== 'anywhere' && p.country) q.set('country', p.country);
  if ((p.scope === 'area' || p.scope === 'close') && p.county) q.set('county', p.county);
  if (p.scope === 'close' && p.sub) q.set('sub_county', p.sub);
  return q;
}

function hookupTags(h) {
  if (!h) return [];
  const wanted = !h.age_min && !h.age_max ? '' : h.age_min && h.age_min === h.age_max ? `${h.age_min}` : `${h.age_min || 18}–${h.age_max || 99}`;
  const who = h.looking_for === 'woman' ? 'into women' : h.looking_for === 'man' ? 'into men' : wanted ? 'looking for' : null;
  return [
    h.age ? `${h.age}${h.gender && h.gender !== 'other' ? ` · ${h.gender}` : ''}` : null,
    h.area || null,
    who ? `${who}${wanted ? ` ${wanted}` : ''}` : null,
    (h.guided?.hosting && HOSTING_TAG[h.guided.hosting]) || null,
  ].filter(Boolean);
}

// Paged list against one URL: first page on change, `more` follows the cursor.
function usePaged(url) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ has_more: false, cursor: null });
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!url) { setItems([]); setMeta({ has_more: false, cursor: null }); return; }
    const mine = ++seq.current;
    setLoading(true); setFailed(false);
    get(url)
      .then(({ results, ...rest }) => { if (mine === seq.current) { setItems(results || []); setMeta(rest); } })
      .catch(() => { if (mine === seq.current) { setItems([]); setFailed(true); } })
      .finally(() => { if (mine === seq.current) setLoading(false); });
  }, [url]);

  const more = useCallback(async () => {
    if (!url || !meta.cursor || loading) return;
    const mine = seq.current;
    setLoading(true);
    try {
      const { results, ...rest } = await get(`${url}${url.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(meta.cursor)}${meta.loose ? '&loose=true' : ''}`);
      if (mine !== seq.current) return;
      setItems((cur) => [...cur, ...(results || [])]);
      setMeta(rest);
    } catch { /* keep what's shown */ } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [url, meta.cursor, loading]);

  return { items, meta, loading, failed, more };
}

export default function SearchScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState('near');
  const [query, setQuery] = useState('');
  const [parsed, setParsed] = useState(null);
  const [applied, setApplied] = useState([]);   // chips in force, from typing or a suggestion
  const [sugs, setSugs] = useState([]);
  const [focused, setFocused] = useState(false);
  const [where, setWhere] = useState(ANYWHERE);
  const [override, setOverride] = useState(null);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [gender, setGender] = useState('');
  const [fresh, setFresh] = useState('');
  const [stab, setStab] = useState('latest');
  const [topic, setTopic] = useState('');
  const [topics, setTopics] = useState({ moods: [], topics: [] });
  const [history, setHistory] = useState([]);
  const [picked, setPicked] = useState(null);   // Surprise me: shown on top of Stories

  const place = override || where;
  const keyword = parsed ? parsed.keyword : query.trim();

  useEffect(() => {
    (async () => {
      try {
        const [t, w, h] = await Promise.all([AsyncStorage.getItem(TAB_KEY), AsyncStorage.getItem(WHERE_KEY), AsyncStorage.getItem(HISTORY_KEY)]);
        if (t === 'near' || t === 'stories') setTab(t);
        if (w) setWhere(JSON.parse(w));
        else if (isAuthenticated) {
          const me = await get('/users/me').catch(() => null);
          if (me) setWhere({
            scope: me.location_county ? 'area' : me.location_country ? 'country' : 'anywhere',
            country: me.location_country || '', county: me.location_county || '', sub: me.location_sub_county || '',
          });
        }
        if (h) setHistory(JSON.parse(h));
      } catch { /* defaults */ }
    })();
    get('/discover/topics').then(setTopics).catch(() => {});
  }, [isAuthenticated]);

  const pickTab = (t) => { setTab(t); AsyncStorage.setItem(TAB_KEY, t).catch(() => {}); };
  const saveWhere = (p) => {
    setWhere(p); setOverride(null); setPlaceOpen(false);
    AsyncStorage.setItem(WHERE_KEY, JSON.stringify(p)).catch(() => {});
  };

  // typed text -> chips
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setParsed(null); return undefined; }
    const t = setTimeout(() => {
      get(`/discover/parse?q=${encodeURIComponent(q)}`)
        .then((p) => {
          setParsed(p);
          if (p.surface) pickTab(p.surface);
          p.chips.forEach((c) => applyChip(c.kind === 'place' ? { ...c, country: p.country || '' } : c, false));
        })
        .catch(() => setParsed(null));
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  // suggestions while typing: curated lists only (places, moods, connection words, phrases)
  useEffect(() => {
    if (!focused) return undefined;
    const t = setTimeout(() => {
      get(`/discover/suggest?surface=${tab}&q=${encodeURIComponent(query.trim())}`)
        .then((r) => setSugs(r.suggestions || []))
        .catch(() => setSugs([]));
    }, 200);
    return () => clearTimeout(t);
  }, [query, focused, tab]);

  // Put a chip in force: the same effect whether it came from typing or a tap.
  function applyChip(c, switchTab = true) {
    if (c.kind === 'gender') setGender(c.value);
    if (c.kind === 'fresh') setFresh(c.value);
    if (c.kind === 'topic') { setTopic(c.value); if (switchTab) pickTab('stories'); }
    if (c.kind === 'place') setOverride({ scope: 'area', country: c.country || '', county: c.value, sub: '' });
    if (c.kind === 'country') setOverride({ scope: 'country', country: c.value, county: '', sub: '' });
    if (switchTab && ['gender', 'fresh', 'place', 'country'].includes(c.kind)) pickTab('near');
    setApplied((cur) => [...cur.filter((x) => x.kind !== c.kind), c]);
  }

  const dropChip = (c) => {
    if (c.kind === 'place' || c.kind === 'country') setOverride(null);
    if (c.kind === 'gender') setGender('');
    if (c.kind === 'fresh') setFresh('');
    if (c.kind === 'topic') setTopic('');
    setApplied((cur) => cur.filter((x) => x !== c));
  };

  const pickSuggestion = (sg) => {
    if (sg.apply) { applyChip(sg.apply); setQuery(''); setParsed(null); }
    else if (sg.text) setQuery(sg.text);
    setFocused(false);
  };

  const clearAll = () => {
    applied.forEach(dropChip);
    setQuery(''); setParsed(null); setOverride(null); setApplied([]);
  };

  const remember = () => {
    const q = query.trim();
    if (!q) return;
    const next = [q, ...history.filter((h) => h !== q)].slice(0, MAX_HISTORY);
    setHistory(next);
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
  };
  const setHist = (next) => { setHistory(next); AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {}); };

  const surprise = async () => {
    try {
      const r = await get('/discover/surprise');
      if (r.post) setPicked(r.post);
    } catch { /* nothing to show */ }
  };

  // ── Near ──
  const nearUrl = useMemo(() => {
    const q = placeParams(place);
    if (gender) q.set('gender', gender);
    if (fresh) q.set('fresh', fresh);
    if (keyword) q.set('q', keyword);
    return `/discover/near?${q}`;
  }, [place, gender, fresh, keyword]);
  const near = usePaged(tab === 'near' ? nearUrl : null);
  const rooms = usePaged(tab === 'near' && !keyword ? `/discover/rooms?${placeParams(place)}` : null);

  // ── Stories ──
  const storiesUrl = useMemo(() => {
    const q = new URLSearchParams({ tab: stab });
    if (topic) q.set('topic', topic);
    if (keyword) q.set('q', keyword);
    return `/discover/stories?${q}`;
  }, [stab, topic, keyword]);
  const stories = usePaged(tab === 'stories' ? storiesUrl : null);

  const list = tab === 'near' ? near : stories;
  const wider = WIDER[place.scope];

  const Header = (
    <View>
      {tab === 'near' ? (
        <>
          <TouchableOpacity style={styles.place} onPress={() => setPlaceOpen((v) => !v)} activeOpacity={0.85}>
            <MapPin size={rs(18)} color={T.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.placeSmall}>Discover in{override ? ' · from your search' : ''}</Text>
              <Text style={styles.placeBig} numberOfLines={1}>{placeLabel(place)}</Text>
            </View>
            <Text style={styles.link}>{placeOpen ? 'Done' : 'Change'}</Text>
          </TouchableOpacity>
          {placeOpen && <PlacePicker current={place} onSave={saveWhere} />}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Chip label="Women" on={gender === 'woman'} onPress={() => setGender(gender === 'woman' ? '' : 'woman')} />
            <Chip label="Men" on={gender === 'man'} onPress={() => setGender(gender === 'man' ? '' : 'man')} />
            {FRESH.map(([id, l]) => <Chip key={id} label={l} on={fresh === id} onPress={() => setFresh(fresh === id ? '' : id)} />)}
          </ScrollView>
          {near.meta.loose && near.items.length > 0 && (
            <Text style={styles.note}>No post has all of those words, so these have some of them.</Text>
          )}
          {rooms.items.length > 0 && (
            <>
              <Text style={styles.section}>ROOMS YOU CAN KNOCK ON</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: rp(10), paddingBottom: rp(10) }}>
                {rooms.items.map((r) => (
                  <TouchableOpacity key={r.user_id} style={styles.room} onPress={() => navigation.navigate('Room', { userId: r.user_id })} activeOpacity={0.85}>
                    <Avatar url={r.avatar_url} name={r.anonymous_name} />
                    <Text style={styles.roomName} numberOfLines={1}>{r.anonymous_name || 'Anonymous'}</Text>
                    {!!r.place && <Text style={styles.meta} numberOfLines={1}>{r.place}</Text>}
                    <Text style={r.open ? styles.open : styles.break}>{r.open ? 'Open' : 'Taking a break'}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
        </>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {STORY_TABS.map(([id, l]) => <Chip key={id} label={l} on={stab === id} onPress={() => setStab(id)} />)}
            <TouchableOpacity style={styles.surprise} onPress={surprise} activeOpacity={0.85}>
              <Shuffle size={rs(13)} color={T.violet || '#B36BFF'} />
              <Text style={styles.surpriseText}>Surprise me</Text>
            </TouchableOpacity>
          </ScrollView>
          {topics.moods.length > 0 && (
            <>
              <Text style={styles.section}>MOODS</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {topics.moods.map((m) => <Chip key={m.id} label={m.label} on={topic === m.id} onPress={() => setTopic(topic === m.id ? '' : m.id)} />)}
              </ScrollView>
              <Text style={styles.section}>TOPICS</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {topics.topics.map((m) => <Chip key={m.id} label={m.label} on={topic === m.id} onPress={() => setTopic(topic === m.id ? '' : m.id)} />)}
              </ScrollView>
            </>
          )}
          {picked && (
            <View style={{ marginBottom: rp(10) }}>
              <View style={styles.sectionRow}>
                <Text style={styles.section}>A RANDOM ONE</Text>
                <TouchableOpacity onPress={() => setPicked(null)} hitSlop={HIT_SLOP}><Text style={styles.link}>Hide</Text></TouchableOpacity>
              </View>
              <DropCard post={picked} onSave={() => {}} />
            </View>
          )}
          {stories.meta.loose && stories.items.length > 0 && (
            <Text style={styles.note}>No post has all of those words, so these have some of them.</Text>
          )}
          {stab === 'trending' && stories.meta.trending_ready === false && (
            <Text style={styles.note}>Not enough going on for Trending yet, so here's what's newest.</Text>
          )}
        </>
      )}
    </View>
  );

  const Empty = () => {
    if (list.loading) return <ActivityIndicator color={T.primary} style={{ marginTop: rp(30) }} />;
    if (tab === 'near' && near.meta.gate) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Near is for adults.</Text>
          <Text style={styles.emptyText}>
            {near.meta.gate === 'signin'
              ? 'Sign in and confirm you’re 18+ to see who’s looking near you.'
              : 'Near isn’t in the app yet. Here you can read Stories.'}
          </Text>
          <Pill label="Read Stories" primary onPress={() => pickTab('stories')} />
        </View>
      );
    }
    if (tab === 'near' && near.meta.needs_place) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{place.scope === 'close' ? 'Tell us your part of town.' : 'Pick a place first.'}</Text>
          <Text style={styles.emptyText}>Close by needs your area. Nobody sees it but you.</Text>
          <Pill label="Choose a place" primary onPress={() => setPlaceOpen(true)} />
          {wider && <Pill label="Look wider" onPress={() => saveWhere({ ...place, scope: wider })} />}
        </View>
      );
    }
    if (list.failed) {
      return <View style={styles.empty}><Text style={styles.emptyTitle}>Couldn’t load this.</Text><Text style={styles.emptyText}>Check your connection and try again.</Text></View>;
    }
    return tab === 'near' ? (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No fresh connections {place.scope === 'anywhere' ? 'right now' : 'in this area yet'}.</Text>
        <Text style={styles.emptyText}>{keyword || gender || fresh ? 'Nothing matches all of that. Loosen a filter or look wider.' : 'Be the first one people find here, or look a little wider.'}</Text>
        {wider && <Pill label={`Look in ${wider === 'anywhere' ? 'the whole world' : wider === 'country' ? 'my country' : 'my area'}`} primary onPress={() => saveWhere({ ...place, scope: wider })} />}
        <Pill label="Read Stories" onPress={() => pickTab('stories')} />
      </View>
    ) : (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Nothing here yet.</Text>
        <Text style={styles.emptyText}>{keyword || topic ? 'Try a different word, or a braver one.' : 'Be the first to say it.'}</Text>
        {!!topic && <Pill label="Clear topic" onPress={() => setTopic('')} />}
      </View>
    );
  };

  const Footer = () => (
    <View style={{ paddingBottom: rp(30) }}>
      {list.items.length > 0 && list.loading && <ActivityIndicator color={T.primary} style={{ marginVertical: rp(14) }} />}
      {list.meta.has_more && !list.loading && <Pill label="Show more" onPress={list.more} />}
      {!query && history.length > 0 && (
        <View style={{ marginTop: rp(18) }}>
          <View style={styles.sectionRow}>
            <Text style={styles.section}>RECENT ON THIS DEVICE</Text>
            <TouchableOpacity onPress={() => setHist([])} hitSlop={HIT_SLOP}><Text style={styles.link}>Clear history</Text></TouchableOpacity>
          </View>
          {history.map((h) => (
            <TouchableOpacity key={h} style={styles.histItem} onPress={() => setQuery(h)} activeOpacity={0.75}>
              <Clock size={rs(15)} color={T.textSecondary} />
              <Text style={styles.histText} numberOfLines={1}>{h}</Text>
              <TouchableOpacity onPress={() => setHist(history.filter((x) => x !== h))} hitSlop={HIT_SLOP}><X size={rs(15)} color={T.textSecondary} /></TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  const renderItem = ({ item }) => (tab === 'near'
    ? <NearCard card={item} onRoom={() => navigation.navigate('Room', { userId: item.room.user_id, postId: item.post.id })} />
    : <DropCard post={item} onSave={() => {}} />);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} accessibilityLabel="Back">
          <ArrowLeft size={rs(22)} color={T.text} />
        </TouchableOpacity>
        <View style={styles.inputWrap}>
          <Search size={rs(17)} color={T.textSecondary} />
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => { remember(); setFocused(false); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={tab === 'near' ? 'try “dem wa Kisumu”' : 'try “stories za heartbreak”'}
            placeholderTextColor={T.textMute}
            returnKeyType="search"
            autoCorrect={false}
          />
          {(!!query || applied.length > 0) && (
            <TouchableOpacity onPress={clearAll} hitSlop={HIT_SLOP} accessibilityLabel="Clear search and filters">
              <X size={rs(16)} color={T.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {focused && (sugs.length > 0 || history.length > 0) && (
        <View style={styles.sugBox}>
          {history.filter((h) => !query.trim() || h.toLowerCase().startsWith(query.trim().toLowerCase())).slice(0, 3).map((h) => (
            <TouchableOpacity key={`h-${h}`} style={styles.sugItem} onPress={() => { setQuery(h); setFocused(false); }}>
              <Clock size={rs(14)} color={T.textSecondary} />
              <Text style={styles.sugText} numberOfLines={1}>{h}</Text>
              <Text style={styles.sugKind}>recent</Text>
            </TouchableOpacity>
          ))}
          {sugs.map((sg) => (
            <TouchableOpacity key={`${sg.kind}-${sg.label}`} style={styles.sugItem} onPress={() => pickSuggestion(sg)}>
              {sg.kind === 'place' || sg.kind === 'country' ? <MapPin size={rs(14)} color={T.textSecondary} /> : <Search size={rs(14)} color={T.textSecondary} />}
              <Text style={styles.sugText} numberOfLines={1}>{sg.label}</Text>
              {!!sg.apply && <Text style={styles.sugKind}>{({ place: 'place', country: 'country', gender: 'who', fresh: 'when', topic: 'mood' })[sg.kind] || 'filter'}</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.tabs}>
        {[['near', 'Near'], ['stories', 'Stories']].map(([id, l]) => (
          <TouchableOpacity key={id} style={[styles.tab, tab === id && styles.tabOn]} onPress={() => pickTab(id)} accessibilityRole="tab" accessibilityState={{ selected: tab === id }}>
            <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {applied.length > 0 && (
        <View style={styles.readRow}>
          <Text style={styles.meta}>{parsed?.chips?.length ? 'Reading it as' : 'Filtering by'}</Text>
          {applied.map((c) => (
            <TouchableOpacity key={c.kind + c.value} style={styles.readChip} onPress={() => dropChip(c)} accessibilityLabel={`Remove ${c.label}`}>
              <Text style={styles.readText}>{c.label}</Text>
              <X size={rs(11)} color={T.primary} />
            </TouchableOpacity>
          ))}
        </View>
      )}
      {(parsed?.suggest || []).filter((c) => !applied.some((a) => a.kind === c.kind && a.value === c.value)).length > 0 && (
        <View style={styles.readRow}>
          <Text style={styles.meta}>Did you mean</Text>
          {parsed.suggest.filter((c) => !applied.some((a) => a.kind === c.kind && a.value === c.value)).map((c) => (
            <TouchableOpacity key={c.kind + c.value} style={styles.chip} onPress={() => applyChip(c)}>
              <Text style={styles.chipText}>+ {c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <FlatList
        data={list.items}
        keyExtractor={(item, i) => (tab === 'near' ? item.post?.id : item.id) || String(i)}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        ListEmptyComponent={Empty}
        ListFooterComponent={Footer}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onEndReached={list.more}
        onEndReachedThreshold={0.4}
      />
    </View>
  );
}

function PlacePicker({ current, onSave }) {
  const [p, setP] = useState(current);
  const needsCounty = p.scope === 'area' || p.scope === 'close';
  const ready = p.scope === 'anywhere' || (p.country && (!needsCounty || p.county) && (p.scope !== 'close' || p.sub));
  return (
    <View style={styles.picker}>
      <Text style={styles.note}>Only where you're looking. The location on your posts doesn't change, and nobody sees where you browse.</Text>
      <View style={styles.scopes}>
        {SCOPES.map((s) => <Chip key={s.id} label={s.label} on={p.scope === s.id} onPress={() => setP({ ...p, scope: s.id })} />)}
      </View>
      {p.scope !== 'anywhere' && (
        <>
          <TextInput style={styles.field} value={p.country} onChangeText={(v) => setP({ ...p, country: v })} placeholder="Country" placeholderTextColor={T.textMute} />
          {needsCounty && <TextInput style={styles.field} value={p.county} onChangeText={(v) => setP({ ...p, county: v })} placeholder="City, county or region" placeholderTextColor={T.textMute} />}
          {p.scope === 'close' && <TextInput style={styles.field} value={p.sub} onChangeText={(v) => setP({ ...p, sub: v })} placeholder="Part of town (e.g. Westlands)" placeholderTextColor={T.textMute} />}
        </>
      )}
      <Pill label="Show me" primary disabled={!ready} onPress={() => onSave({ ...p, country: p.country.trim(), county: p.county.trim(), sub: p.sub.trim() })} />
    </View>
  );
}

function NearCard({ card, onRoom }) {
  const { post, room } = card;
  const tags = hookupTags(post.hookup);
  return (
    <TouchableOpacity style={styles.card} onPress={onRoom} activeOpacity={0.9}>
      <View style={styles.cardTop}>
        <Avatar url={room.avatar_url || post.avatar_url} name={post.anonymous_name} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName} numberOfLines={1}>{post.anonymous_name || 'Anonymous'}</Text>
          <Text style={styles.meta} numberOfLines={1}>{[card.place, post.time_ago].filter(Boolean).join(' · ')}</Text>
        </View>
        <Text style={room.open ? styles.open : styles.break}>{room.open ? 'Open to knocks' : 'Taking a break'}</Text>
      </View>
      {tags.length > 0 && (
        <View style={styles.tags}>{tags.map((t) => <Text key={t} style={styles.tag}>{t}</Text>)}</View>
      )}
      <Text style={styles.cardText} numberOfLines={4}>{post.content}</Text>
      {!!room.intro && <Text style={styles.intro} numberOfLines={2}>“{room.intro}”</Text>}
      <View style={styles.cardFoot}>
        <View style={styles.cta}><Text style={styles.ctaText}>View Room</Text></View>
        {card.more_posts > 0 && <Text style={styles.meta}>+{card.more_posts} more in their Room</Text>}
      </View>
    </TouchableOpacity>
  );
}

function Avatar({ url, name }) {
  return (
    <View style={styles.ava}>
      {url ? <Image source={{ uri: url }} style={styles.avaImg} /> : <Text style={styles.avaLetter}>{(name || 'A').trim().charAt(0).toUpperCase()}</Text>}
    </View>
  );
}

function Chip({ label, on, onPress }) {
  return (
    <TouchableOpacity style={[styles.chip, on && styles.chipOn]} onPress={onPress} activeOpacity={0.8} accessibilityState={{ selected: !!on }}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Pill({ label, onPress, primary, disabled }) {
  return (
    <TouchableOpacity style={[styles.pill, primary && styles.pillPrimary, disabled && { opacity: 0.45 }]} onPress={onPress} disabled={disabled} activeOpacity={0.85}>
      <Text style={[styles.pillText, primary && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: rp(6), paddingBottom: rp(10), gap: SPACING.sm },
  backBtn: { width: rs(36), height: rs(36), alignItems: 'center', justifyContent: 'center' },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: rp(9), backgroundColor: T.surfaceAlt, borderRadius: RADIUS.full || 999, paddingHorizontal: rp(14), height: rs(42) },
  input: { flex: 1, color: T.text, fontSize: FONT.md },
  tabs: { flexDirection: 'row', gap: rp(6), marginHorizontal: SPACING.md, marginBottom: rp(8), padding: rp(4), borderRadius: RADIUS.lg, backgroundColor: T.surface },
  tab: { flex: 1, height: rs(36), borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: T.primaryDim },
  tabText: { color: T.textSecondary, fontWeight: '800', fontSize: FONT.sm },
  tabTextOn: { color: T.primary },
  sugBox: { marginHorizontal: SPACING.md, marginBottom: rp(8), padding: rp(6), borderRadius: RADIUS.lg, backgroundColor: T.surfaceAlt },
  sugItem: { flexDirection: 'row', alignItems: 'center', gap: rp(10), paddingVertical: rp(10), paddingHorizontal: rp(8) },
  sugText: { flex: 1, color: T.text, fontSize: FONT.sm },
  sugKind: { color: T.textMute, fontSize: rf(11) },
  readRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: rp(6), marginHorizontal: SPACING.md, marginBottom: rp(8) },
  readChip: { flexDirection: 'row', alignItems: 'center', gap: rp(4), paddingHorizontal: rp(10), paddingVertical: rp(4), borderRadius: 999, backgroundColor: T.primaryDim, borderWidth: 1, borderColor: T.primaryBorder },
  readText: { color: T.primary, fontSize: rf(12), fontWeight: '700' },
  list: { paddingHorizontal: SPACING.md },
  place: { flexDirection: 'row', alignItems: 'center', gap: rp(10), padding: rp(12), borderRadius: RADIUS.lg, backgroundColor: T.surface, marginVertical: rp(6) },
  placeSmall: { color: T.textSecondary, fontSize: rf(11) },
  placeBig: { color: T.text, fontSize: FONT.md, fontWeight: '700' },
  link: { color: T.primary, fontSize: rf(12), fontWeight: '700' },
  picker: { padding: rp(12), borderRadius: RADIUS.lg, backgroundColor: T.surface, gap: rp(8), marginBottom: rp(8) },
  scopes: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8) },
  field: { height: rs(42), paddingHorizontal: rp(12), borderRadius: RADIUS.md, backgroundColor: T.surfaceAlt, color: T.text, fontSize: FONT.sm },
  chipRow: { gap: rp(8), paddingVertical: rp(8) },
  chip: { paddingHorizontal: rp(14), paddingVertical: rp(7), borderRadius: 999, backgroundColor: T.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  chipOn: { backgroundColor: T.primaryDim, borderColor: T.primaryBorder },
  chipText: { color: T.textSecondary, fontSize: rf(13), fontWeight: '700' },
  chipTextOn: { color: T.primary },
  surprise: { flexDirection: 'row', alignItems: 'center', gap: rp(5), paddingHorizontal: rp(14), paddingVertical: rp(7), borderRadius: 999, backgroundColor: 'rgba(179,107,255,0.10)', borderWidth: 1, borderColor: 'rgba(179,107,255,0.4)' },
  surpriseText: { color: '#B36BFF', fontSize: rf(13), fontWeight: '700' },
  section: { color: T.textSecondary, fontSize: rf(11), fontWeight: '800', letterSpacing: 0.6, marginTop: rp(8) },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  note: { color: T.textSecondary, fontSize: rf(12), marginVertical: rp(6), lineHeight: rf(17) },
  meta: { color: T.textSecondary, fontSize: rf(12) },
  room: { width: rs(140), padding: rp(12), borderRadius: RADIUS.lg, backgroundColor: T.surface, gap: rp(4) },
  roomName: { color: T.text, fontWeight: '700', fontSize: FONT.sm },
  card: { marginBottom: rp(12), padding: rp(14), borderRadius: RADIUS.lg, backgroundColor: T.surfaceAlt },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: rp(10) },
  cardName: { color: T.text, fontWeight: '700', fontSize: FONT.md },
  ava: { width: rs(44), height: rs(44), borderRadius: rs(22), borderWidth: 2, borderColor: T.primary, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avaImg: { width: '100%', height: '100%' },
  avaLetter: { color: T.primary, fontWeight: '800', fontSize: rf(18) },
  open: { color: '#34d399', backgroundColor: 'rgba(52,211,153,0.12)', fontSize: rf(11), fontWeight: '700', paddingHorizontal: rp(8), paddingVertical: rp(3), borderRadius: 10, overflow: 'hidden', alignSelf: 'flex-start' },
  break: { color: T.textSecondary, backgroundColor: 'rgba(255,255,255,0.06)', fontSize: rf(11), fontWeight: '700', paddingHorizontal: rp(8), paddingVertical: rp(3), borderRadius: 10, overflow: 'hidden', alignSelf: 'flex-start' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(6), marginTop: rp(10) },
  tag: { color: T.text, fontSize: rf(12), backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: rp(8), paddingVertical: rp(3), borderRadius: 10, overflow: 'hidden' },
  cardText: { color: T.text, fontSize: FONT.sm, lineHeight: FONT.sm * 1.5, marginTop: rp(10) },
  intro: { color: T.textSecondary, fontStyle: 'italic', fontSize: rf(13), marginTop: rp(8) },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: rp(10), marginTop: rp(12) },
  cta: { backgroundColor: T.primary, paddingHorizontal: rp(16), height: rs(36), borderRadius: rs(18), justifyContent: 'center' },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: FONT.sm },
  empty: { alignItems: 'center', paddingVertical: rp(36), paddingHorizontal: rp(12), gap: rp(10) },
  emptyTitle: { color: T.text, fontSize: rf(17), fontWeight: '700', textAlign: 'center' },
  emptyText: { color: T.textSecondary, fontSize: FONT.sm, textAlign: 'center', lineHeight: FONT.sm * 1.5 },
  pill: { alignSelf: 'center', paddingHorizontal: rp(18), height: rs(38), borderRadius: rs(19), justifyContent: 'center', backgroundColor: T.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginTop: rp(4) },
  pillPrimary: { backgroundColor: T.primary, borderColor: T.primary },
  pillText: { color: T.text, fontWeight: '700', fontSize: FONT.sm },
  histItem: { flexDirection: 'row', alignItems: 'center', gap: rp(10), paddingVertical: rp(12), borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  histText: { flex: 1, color: T.text, fontSize: FONT.sm },
});
