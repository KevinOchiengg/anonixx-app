/**
 * SearchScreen — full-text search across drops and confessions.
 * Auto-focuses on open, persists history, supports All / Recent / Popular filters.
 */
import React, {
  useState, useEffect, useCallback, useRef,
} from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, StatusBar, ActivityIndicator, Keyboard, Image, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Clock, Search, X, Users, MapPin } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import DropCard from '../../components/feed/DropCard';
import LocationField from '../../components/drops/LocationField';
import { CARD_INTENT_LIST } from '../../components/drops/DropCardRenderer';
import { API_BASE_URL } from '../../config/api';
import {
  rs, rf, rp, rh, SPACING, FONT, RADIUS, HIT_SLOP,
} from '../../utils/responsive';
import T from '../../utils/theme';

const HISTORY_KEY   = '@anonixx_search_history';
const MAX_HISTORY   = 10;
const FILTERS       = ['all', 'recent', 'popular'];
const SUGGESTIONS   = ['secrets', 'heartbreak', 'late night thoughts', 'desire', 'carrying it alone', 'family'];
// Drops vs Circles — the app's only two searchable content types.
const CONTENT_TYPES = [
  { id: 'drops',   label: 'Drops' },
  { id: 'circles', label: 'Circles' },
];
// Same confession-type picker as compose (DropsComposeScreen), used here as
// a facet filter — mirrors VALID_INTENTS in Backend/app/api/v1/drops.py.
// Pulled straight from DropCardRenderer so the label + accent color a user
// picked at compose time is exactly what they tap to find it again.
const THEMES = CARD_INTENT_LIST.map(({ id, label, accent }) => ({ id, label, accent }));
const LIVE_SEARCH_DEBOUNCE_MS = 400;
const MIN_LIVE_QUERY_LEN = 2;

// ─── Lightweight result row for Circles ────────────────────────
const CircleResultRow = React.memo(({ item, onPress }) => (
  <TouchableOpacity style={rowStyles.wrap} onPress={() => onPress(item)} activeOpacity={0.8}>
    <View style={[rowStyles.iconBox, { backgroundColor: `${item.aura_color || T.primary}22` }]}>
      {item.avatar_url
        ? <Image source={{ uri: item.avatar_url }} style={rowStyles.avatarImg} />
        : <Text style={{ fontSize: rf(18) }}>{item.avatar_emoji || '🎭'}</Text>
      }
    </View>
    <View style={{ flex: 1 }}>
      <Text style={rowStyles.title} numberOfLines={1}>{item.name}</Text>
      <Text style={rowStyles.sub} numberOfLines={1}>{item.bio}</Text>
    </View>
    <View style={rowStyles.memberChip}>
      <Users size={rs(11)} color={T.textMuted} />
      <Text style={rowStyles.memberChipText}>{item.member_count}</Text>
    </View>
  </TouchableOpacity>
));

// ─── Screen ───────────────────────────────────────────────────
export default function SearchScreen({ navigation }) {
  const insets            = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const inputRef          = useRef(null);

  const [query,      setQuery]      = useState('');
  const [results,    setResults]    = useState([]);
  const [history,    setHistory]    = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [searched,   setSearched]   = useState(false);
  const [total,      setTotal]      = useState(0);
  const [filter,     setFilter]     = useState('all');
  const [contentType, setContentType] = useState('drops');
  const [intent,      setIntent]      = useState(null);
  const [locationOpen,    setLocationOpen]    = useState(false);
  const [locCountry,      setLocCountry]      = useState('');
  const [locCounty,       setLocCounty]       = useState('');
  const [locSubCounty,    setLocSubCounty]    = useState('');
  const [locEstate,       setLocEstate]       = useState('');
  const liveSearchTimer = useRef(null);

  const hasLocationFilter = !!(locCountry || locCounty || locSubCounty || locEstate);

  // Load history on mount, auto-focus input
  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then(raw => {
      if (raw) setHistory(JSON.parse(raw));
    });
    setTimeout(() => inputRef.current?.focus(), 120);
  }, []);

  const saveHistory = useCallback(async (q) => {
    const updated = [q, ...history.filter(h => h !== q)].slice(0, MAX_HISTORY);
    setHistory(updated);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  }, [history]);

  const clearHistory = useCallback(async () => {
    setHistory([]);
    await AsyncStorage.removeItem(HISTORY_KEY);
  }, []);

  const removeHistoryItem = useCallback(async (item) => {
    const updated = history.filter(h => h !== item);
    setHistory(updated);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  }, [history]);

  const doSearch = useCallback(async (
    q = query, f = filter, type = contentType,
    {
      silent = false, theme = intent,
      country = locCountry, county = locCounty, subCounty = locSubCounty, estate = locEstate,
    } = {},
  ) => {
    const trimmed = q.trim();
    const hasLocation = !!(country || county || subCounty || estate);
    // A facet alone (theme and/or location, no typed text) is a valid
    // "browse by…" search — only bail if there's truly nothing to go on.
    if (!trimmed && !(type === 'drops' && (theme || hasLocation))) return;

    if (!silent) Keyboard.dismiss();
    setLoading(true);
    setSearched(true);
    if (!silent && trimmed) await saveHistory(trimmed);

    try {
      const token = await AsyncStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      let data;
      let list;
      let count;

      if (type === 'circles') {
        const params = new URLSearchParams({ q: trimmed, limit: '30' });
        const res = await fetch(`${API_BASE_URL}/api/v1/circles/?${params}`, { headers });
        data = await res.json();
        if (!res.ok) throw new Error();
        list = data.circles || [];
        count = list.length;
      } else {
        const params = new URLSearchParams({ filter: f, limit: '30' });
        if (trimmed) params.set('q', trimmed);
        if (theme) params.set('intent', theme);
        if (country)   params.set('location_country', country);
        if (county)    params.set('location_county', county);
        if (subCounty) params.set('location_sub_county', subCounty);
        if (estate)    params.set('location_estate', estate);
        const res = await fetch(`${API_BASE_URL}/api/v1/drops/search?${params}`, { headers });
        data = await res.json();
        if (!res.ok) throw new Error();
        list = data.results || [];
        count = data.total || 0;
      }
      setResults(list);
      setTotal(count);
    } catch {
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query, filter, contentType, intent, locCountry, locCounty, locSubCounty, locEstate, saveHistory]);

  const handleFilterChange = useCallback((f) => {
    setFilter(f);
    if (searched) doSearch(query, f, contentType);
  }, [searched, query, contentType, doSearch]);

  const handleContentTypeChange = useCallback((type) => {
    setContentType(type);
    if (query.trim() || (type === 'drops' && (intent || hasLocationFilter))) {
      doSearch(query, filter, type);
    }
  }, [query, filter, intent, hasLocationFilter, doSearch]);

  // Location fields update live as you pick them — same "browse by facet
  // alone" behavior the theme chips already have.
  const handleLocationChange = useCallback((next) => {
    const stillFiltered = query.trim() || intent
      || next.country || next.county || next.subCounty || next.estate;
    if (!stillFiltered) {
      setResults([]); setSearched(false); setTotal(0);
      return;
    }
    doSearch(query, filter, 'drops', {
      country: next.country, county: next.county, subCounty: next.subCounty, estate: next.estate,
    });
  }, [query, filter, intent, doSearch]);

  const updateLocation = useCallback((patch) => {
    const next = {
      country:   patch.country   ?? locCountry,
      county:    patch.county    ?? locCounty,
      subCounty: patch.subCounty ?? locSubCounty,
      estate:    patch.estate    ?? locEstate,
    };
    if (patch.country   !== undefined) setLocCountry(patch.country);
    if (patch.county    !== undefined) setLocCounty(patch.county);
    if (patch.subCounty !== undefined) setLocSubCounty(patch.subCounty);
    if (patch.estate    !== undefined) setLocEstate(patch.estate);
    handleLocationChange(next);
  }, [locCountry, locCounty, locSubCounty, locEstate, handleLocationChange]);

  const handleClearLocation = useCallback(() => {
    setLocCountry(''); setLocCounty(''); setLocSubCounty(''); setLocEstate('');
    handleLocationChange({ country: '', county: '', subCounty: '', estate: '' });
  }, [handleLocationChange]);

  const handleThemeChange = useCallback((id) => {
    const next = intent === id ? null : id;   // tap again to clear
    setIntent(next);
    if (!next && !query.trim() && !hasLocationFilter) {
      setResults([]); setSearched(false); setTotal(0);
      return;
    }
    doSearch(query, filter, 'drops', { theme: next });
  }, [query, filter, intent, hasLocationFilter, doSearch]);

  // Live search-as-you-type — debounced, doesn't touch history (only an
  // explicit submit/history-tap/suggestion-tap does that).
  useEffect(() => {
    clearTimeout(liveSearchTimer.current);
    const trimmed = query.trim();
    if (trimmed.length < MIN_LIVE_QUERY_LEN) return;
    liveSearchTimer.current = setTimeout(() => {
      doSearch(trimmed, filter, contentType, { silent: true });
    }, LIVE_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(liveSearchTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, contentType]);

  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setSearched(false);
    setTotal(0);
    inputRef.current?.focus();
  }, []);

  const handleHistoryPress = useCallback((q) => {
    setQuery(q);
    doSearch(q, filter, contentType);
  }, [filter, contentType, doSearch]);

  const handlePostPress    = useCallback((post) => navigation.navigate('DropDetail', { post }), [navigation]);
  const handleCirclePress  = useCallback((circle) => navigation.navigate('Circles', {
    screen: 'CircleProfile', params: { circleId: circle.id },
  }), [navigation]);
  const handleSave         = useCallback(() => {}, []);

  const renderResult = useCallback(({ item }) => {
    if (contentType === 'circles') return <CircleResultRow item={item} onPress={handleCirclePress} />;
    return (
      <DropCard
        post={item}
        onSave={handleSave}
        onPress={handlePostPress}
      />
    );
  }, [contentType, handleSave, handlePostPress, handleCirclePress]);

  const keyExtractor = useCallback((item, i) => item.id || String(i), []);

  // ── Content: pre-search (history / suggestions) ────────────
  const PreSearch = (
    <View style={styles.preSearch}>
      {history.length > 0 ? (
        <>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionLabel}>Recent</Text>
            <TouchableOpacity onPress={clearHistory} hitSlop={HIT_SLOP}>
              <Text style={styles.clearAll}>Clear all</Text>
            </TouchableOpacity>
          </View>
          {history.map((h) => (
            <TouchableOpacity
              key={h}
              style={styles.historyItem}
              onPress={() => handleHistoryPress(h)}
              activeOpacity={0.75}
            >
              <Clock size={rs(14)} color={T.textMuted} />
              <Text style={styles.historyText}>{h}</Text>
              <TouchableOpacity
                onPress={() => removeHistoryItem(h)}
                hitSlop={HIT_SLOP}
              >
                <X size={rs(14)} color={T.textMuted} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </>
      ) : (
        <>
          <Text style={styles.sectionLabel}>Try searching for</Text>
          <View style={styles.chips}>
            {SUGGESTIONS.map(s => (
              <TouchableOpacity
                key={s}
                style={styles.chip}
                onPress={() => { setQuery(s); doSearch(s, filter, contentType); }}
                activeOpacity={0.8}
              >
                <Text style={styles.chipText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </View>
  );

  // ── Content: results or empty ───────────────────────────────
  const PostSearch = loading ? (
    <View style={styles.centered}>
      <ActivityIndicator color={T.primary} size="large" />
      <Text style={styles.loadingText}>searching…</Text>
    </View>
  ) : results.length > 0 ? (
    <FlatList
      data={results}
      keyExtractor={keyExtractor}
      renderItem={renderResult}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: rh(4), paddingBottom: rh(60) }}
      ListHeaderComponent={
        <Text style={styles.resultCount}>
          {total} result{total !== 1 ? 's' : ''}
          {query.trim() && ` for "${query.trim()}"`}
          {!query.trim() && contentType === 'drops' && intent &&
            ` in ${THEMES.find(t => t.id === intent)?.label}`}
          {contentType === 'drops' && hasLocationFilter &&
            ` near ${[locEstate, locSubCounty, locCounty, locCountry].filter(Boolean).join(', ')}`}
        </Text>
      }
    />
  ) : (
    <View style={styles.centered}>
      <Search size={rs(48)} color={T.textMuted} />
      <Text style={styles.emptyTitle}>nothing found</Text>
      <Text style={styles.emptyBody}>try a different word — or a braver one</Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={T.background} />

      {/* Header — back + input + clear */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={HIT_SLOP}
        >
          <ArrowLeft size={rs(20)} color={T.text} />
        </TouchableOpacity>

        <View style={styles.inputWrap}>
          <Search size={rs(16)} color={T.textMuted} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder={
              contentType === 'circles' ? 'search circles by name…'
              : 'search secrets, moods, names…'
            }
            placeholderTextColor={T.textMuted}
            returnKeyType="search"
            onSubmitEditing={() => doSearch()}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={handleClear} hitSlop={HIT_SLOP}>
              <X size={rs(16)} color={T.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content type — Drops / Circles — primary nav, underline tabs */}
      <View style={styles.tabRow}>
        {CONTENT_TYPES.map(ct => (
          <TouchableOpacity
            key={ct.id}
            style={styles.tab}
            onPress={() => handleContentTypeChange(ct.id)}
            hitSlop={HIT_SLOP}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, contentType === ct.id && styles.tabTextActive]}>
              {ct.label}
            </Text>
            {contentType === ct.id && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Secondary filters — one cohesive zone, not stacked bordered panels */}
      {contentType === 'drops' && (
        <View style={styles.filtersZone}>
          {/* All / Recent / Popular — quiet inline toggle */}
          <View style={styles.sortRow}>
            <Text style={styles.sortLabel}>Sort</Text>
            {FILTERS.map(f => (
              <TouchableOpacity
                key={f}
                onPress={() => handleFilterChange(f)}
                hitSlop={HIT_SLOP}
                style={[styles.sortChip, filter === f && styles.sortChipActive]}
              >
                <Text style={[styles.sortChipText, filter === f && styles.sortChipTextActive]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Theme — same confession types as compose, narrows results
              even with no typed query */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.facetRow}
          >
            <TouchableOpacity
              style={[styles.facetChip, hasLocationFilter && styles.facetChipActive]}
              onPress={() => setLocationOpen((v) => !v)}
              hitSlop={HIT_SLOP}
              activeOpacity={0.8}
            >
              <MapPin size={rs(12)} color={hasLocationFilter ? T.primary : T.textSecondary} />
              <Text style={[styles.facetText, hasLocationFilter && styles.facetTextActive]}>
                {hasLocationFilter
                  ? [locEstate, locSubCounty, locCounty, locCountry].filter(Boolean)[0]
                  : 'Location'}
              </Text>
            </TouchableOpacity>
            {THEMES.map(t => (
              <TouchableOpacity
                key={t.id}
                style={[styles.facetChip, intent === t.id && styles.facetChipActive]}
                onPress={() => handleThemeChange(t.id)}
                hitSlop={HIT_SLOP}
                activeOpacity={0.8}
              >
                <View style={[styles.facetDot, { backgroundColor: t.accent }]} />
                <Text style={[styles.facetText, intent === t.id && styles.facetTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Location filter panel — collapsed by default, exact-match
              search (unlike the passive feed-location scope, this doesn't
              fall back to including unplaced drops). */}
          {locationOpen && (
            <View style={styles.locationPanel}>
              <LocationField
                country={locCountry}
                county={locCounty}
                subCounty={locSubCounty}
                estate={locEstate}
                onChangeCountry={(v) => updateLocation({ country: v })}
                onChangeCounty={(v) => updateLocation({ county: v })}
                onChangeSubCounty={(v) => updateLocation({ subCounty: v })}
                onChangeEstate={(v) => updateLocation({ estate: v })}
              />
              {hasLocationFilter && (
                <TouchableOpacity onPress={handleClearLocation} hitSlop={HIT_SLOP} style={styles.clearLocationBtn}>
                  <Text style={styles.clearAll}>Clear location</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {/* Body */}
      {searched ? PostSearch : PreSearch}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.background },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: SPACING.md,
    paddingTop:        rp(6),
    paddingBottom:     rp(12),
    gap:               SPACING.sm,
  },
  backBtn: {
    width:          rs(36),
    height:         rs(36),
    alignItems:     'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(9),
    backgroundColor: T.surfaceAlt,
    borderRadius:    RADIUS.full,
    paddingHorizontal: rp(16),
    paddingVertical: rp(11),
    borderWidth:     1,
    borderColor:     T.borderStrong,
  },
  input: {
    flex:       1,
    fontFamily: 'DMSans-Regular',
    fontSize:   FONT.md,
    color:      T.text,
    paddingVertical: 0,
    letterSpacing: 0.2,
  },

  // Content type — primary nav, underline tabs (matches CirclesScreen's
  // Discover/My Circles pattern, so this reads as the same app).
  tabRow: {
    flexDirection:     'row',
    paddingHorizontal: SPACING.md,
    gap:               SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  tab: {
    paddingVertical: rp(10),
    position:        'relative',
  },
  tabText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         T.textMuted,
    letterSpacing: 0.3,
  },
  tabTextActive: { color: T.text },
  tabUnderline: {
    position:        'absolute',
    bottom:          -1,
    left:            0,
    right:           0,
    height:          rp(2),
    borderRadius:    rp(1),
    backgroundColor: T.primary,
  },

  // Secondary filters — one cohesive zone with a single outer border,
  // instead of every sub-row boxing itself off with its own divider.
  filtersZone: {
    paddingTop:        rp(10),
    paddingBottom:      rp(4),
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    gap:               rp(2),
  },

  // All / Recent / Popular — quiet inline toggle, subordinate to the facet chips
  sortRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: SPACING.md,
    gap:               rp(6),
    marginBottom:      rp(8),
  },
  sortLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10),
    color:         T.textMute,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginRight:   rp(4),
  },
  sortChip: {
    paddingHorizontal: rp(11),
    paddingVertical:   rp(5),
    borderRadius:      RADIUS.full,
  },
  sortChipActive: { backgroundColor: T.primaryDim },
  sortChipText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize:   rf(12),
    color:      T.textMuted,
  },
  sortChipTextActive: { color: T.primary },

  // Mood facet chips — horizontal scroll, tap again to clear
  facetRow: {
    flexDirection:     'row',
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(6),
    gap:               rp(8),
  },
  facetChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(6),
    paddingHorizontal: rp(13),
    paddingVertical:   rp(7),
    borderRadius:      RADIUS.full,
    backgroundColor:   T.surface,
    borderWidth:       1,
    borderColor:       T.border,
  },
  facetChipActive: {
    backgroundColor: T.primaryDim,
    borderColor:     T.primaryBorder,
  },
  facetDot: { width: rs(8), height: rs(8), borderRadius: rs(4) },
  facetText: {
    fontFamily: 'DMSans-Bold',
    fontSize:   rf(12),
    color:      T.textSecondary,
  },
  facetTextActive: { color: T.primary },

  locationPanel: {
    paddingHorizontal: SPACING.md,
    paddingTop:        rp(4),
    paddingBottom:     rp(10),
  },
  clearLocationBtn: { alignSelf: 'flex-start', marginTop: rp(8), padding: rp(4) },

  // Pre-search
  preSearch: {
    padding: SPACING.md,
  },
  sectionRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   SPACING.sm,
  },
  sectionLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.xs,
    color:         T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  clearAll: {
    fontFamily: 'DMSans-Bold',
    fontSize:   FONT.xs,
    color:      T.primary,
  },
  historyItem: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               SPACING.sm,
    paddingVertical:   rp(12),
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  historyText: {
    flex:       1,
    fontFamily: 'DMSans-Regular',
    fontSize:   FONT.sm,
    color:      T.text,
  },
  chips: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           SPACING.xs,
    marginTop:     SPACING.sm,
  },
  chip: {
    paddingHorizontal: rp(15),
    paddingVertical:   rp(9),
    borderRadius:      RADIUS.full,
    backgroundColor:   T.surface,
    borderWidth:       1,
    borderColor:       T.border,
  },
  chipText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize:   FONT.sm,
    color:      T.text,
  },

  // Results
  resultCount: {
    fontFamily:        'DMSans-Italic',
    fontSize:          FONT.xs,
    color:             T.textSecondary,
    paddingHorizontal: SPACING.md,
    paddingTop:        rp(12),
    paddingBottom:     rp(8),
  },

  // States
  centered: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            SPACING.sm,
    paddingBottom:  rh(60),
    paddingHorizontal: SPACING.xl,
  },
  loadingText: {
    fontFamily: 'DMSans-Italic',
    fontSize:   FONT.sm,
    color:      T.textSecondary,
    marginTop:  rp(8),
  },
  emptyTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(24),
    color:         T.text,
    marginTop:     SPACING.md,
    letterSpacing: 0.2,
  },
  emptyBody: {
    fontFamily: 'DMSans-Italic',
    fontSize:   FONT.sm,
    color:      T.textMute,
    textAlign:  'center',
    marginTop:  rp(4),
  },
});

// ─── Circle result row styles ───────────────────────────────────
const rowStyles = StyleSheet.create({
  wrap: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(12),
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(13),
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  iconBox: {
    width:          rs(42),
    height:         rs(42),
    borderRadius:   rs(21),
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  title: {
    fontFamily: 'PlayfairDisplay-Italic',
    fontSize:   rf(15),
    color:      T.text,
    letterSpacing: 0.2,
  },
  sub: {
    fontFamily: 'DMSans-Regular',
    fontSize:   rf(11),
    color:      T.textMuted,
    marginTop:  rp(3),
    letterSpacing: 0.2,
  },
  memberChip: { flexDirection: 'row', alignItems: 'center', gap: rp(3) },
  memberChipText: { fontFamily: 'DMSans-Bold', fontSize: rf(10), color: T.textMuted },
});
