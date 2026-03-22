/**
 * SearchScreen — full-text search across posts and confessions.
 * Auto-focuses on open, persists history, supports All / Recent / Popular filters.
 */
import React, {
  useState, useEffect, useCallback, useRef,
} from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, StatusBar, ActivityIndicator, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Clock, Search, X } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import CalmPostCard from '../../components/feed/CalmPostCard';
import { API_BASE_URL } from '../../config/api';
import {
  rs, rf, rp, rh, SPACING, FONT, RADIUS, HIT_SLOP,
} from '../../utils/responsive';

// ─── Theme ────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  surfaceAlt:    '#1a1f2e',
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.10)',
  primaryBorder: 'rgba(255,99,74,0.22)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  textMuted:     '#4a5068',
  border:        'rgba(255,255,255,0.06)',
  borderStrong:  'rgba(255,255,255,0.10)',
};

const HISTORY_KEY   = '@anonixx_search_history';
const MAX_HISTORY   = 10;
const FILTERS       = ['all', 'recent', 'popular'];
const SUGGESTIONS   = ['anxiety', 'loneliness', 'hope', 'healing', 'relationships', 'family'];

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

  const doSearch = useCallback(async (q = query, f = filter) => {
    const trimmed = q.trim();
    if (!trimmed) return;

    Keyboard.dismiss();
    setLoading(true);
    setSearched(true);
    await saveHistory(trimmed);

    try {
      const token = await AsyncStorage.getItem('token');
      const params = new URLSearchParams({ q: trimmed, filter: f, limit: '30' });
      const res = await fetch(`${API_BASE_URL}/api/v1/posts/search?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data.results || []);
        setTotal(data.total || 0);
      } else {
        setResults([]);
        setTotal(0);
      }
    } catch {
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query, filter, saveHistory]);

  const handleFilterChange = useCallback((f) => {
    setFilter(f);
    if (searched) doSearch(query, f);
  }, [searched, query, doSearch]);

  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setSearched(false);
    setTotal(0);
    inputRef.current?.focus();
  }, []);

  const handleHistoryPress = useCallback((q) => {
    setQuery(q);
    doSearch(q, filter);
  }, [filter, doSearch]);

  const handlePostPress    = useCallback((post) => navigation.navigate('PostDetail', { post }), [navigation]);
  const handleViewThread   = useCallback((postId) => navigation.navigate('ThreadView', { postId }), [navigation]);
  const handleResponse     = useCallback(() => {}, []);
  const handleSave         = useCallback(() => {}, []);

  const renderResult = useCallback(({ item }) => (
    <CalmPostCard
      post={item}
      onResponse={handleResponse}
      onSave={handleSave}
      onViewThread={handleViewThread}
      onPress={handlePostPress}
      navigation={navigation}
    />
  ), [navigation, handleResponse, handleSave, handleViewThread, handlePostPress]);

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
                onPress={() => { setQuery(s); doSearch(s, filter); }}
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
          {total} result{total !== 1 ? 's' : ''} for "{query.trim()}"
        </Text>
      }
    />
  ) : (
    <View style={styles.centered}>
      <Search size={rs(48)} color={T.textMuted} />
      <Text style={styles.emptyTitle}>nothing found</Text>
      <Text style={styles.emptyBody}>try different keywords or spelling</Text>
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
          <Search size={rs(15)} color={T.textMuted} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="search posts, confessions…"
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

      {/* Filter chips — always visible */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => handleFilterChange(f)}
            hitSlop={HIT_SLOP}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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
    paddingVertical:   rp(10),
    gap:               SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
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
    gap:             rp(8),
    backgroundColor: T.surfaceAlt,
    borderRadius:    RADIUS.full,
    paddingHorizontal: rp(14),
    paddingVertical: rp(9),
    borderWidth:     1,
    borderColor:     T.borderStrong,
  },
  input: {
    flex:     1,
    fontSize: FONT.md,
    color:    T.text,
    paddingVertical: 0,
  },

  // Filters
  filterRow: {
    flexDirection:     'row',
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(12),
    gap:               SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  filterChip: {
    paddingHorizontal: rp(14),
    paddingVertical:   rp(6),
    borderRadius:      RADIUS.full,
    backgroundColor:   T.surface,
    borderWidth:       1,
    borderColor:       T.border,
  },
  filterChipActive: {
    backgroundColor: T.primaryDim,
    borderColor:     T.primaryBorder,
  },
  filterText:       { fontSize: FONT.sm, fontWeight: '600', color: T.textSecondary },
  filterTextActive: { color: T.primary },

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
    fontSize:      FONT.xs,
    fontWeight:    '700',
    color:         T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  clearAll: {
    fontSize:   FONT.xs,
    color:      T.primary,
    fontWeight: '500',
  },
  historyItem: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               SPACING.sm,
    paddingVertical:   rp(11),
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  historyText: {
    flex:     1,
    fontSize: FONT.sm,
    color:    T.text,
  },
  chips: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           SPACING.xs,
    marginTop:     SPACING.sm,
  },
  chip: {
    paddingHorizontal: rp(14),
    paddingVertical:   rp(8),
    borderRadius:      RADIUS.full,
    backgroundColor:   T.surface,
    borderWidth:       1,
    borderColor:       T.border,
  },
  chipText: {
    fontSize:   FONT.sm,
    color:      T.text,
    fontWeight: '500',
  },

  // Results
  resultCount: {
    fontSize:          FONT.xs,
    color:             T.textSecondary,
    paddingHorizontal: SPACING.md,
    paddingBottom:     rp(8),
    fontStyle:         'italic',
  },

  // States
  centered: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            SPACING.sm,
    paddingBottom:  rh(60),
  },
  loadingText: {
    fontSize:  FONT.sm,
    color:     T.textSecondary,
    fontStyle: 'italic',
    marginTop: rp(8),
  },
  emptyTitle: {
    fontSize:   FONT.xl,
    fontWeight: '700',
    color:      T.text,
    marginTop:  SPACING.md,
  },
  emptyBody: {
    fontSize: FONT.sm,
    color:    T.textMuted,
    textAlign: 'center',
  },
});
