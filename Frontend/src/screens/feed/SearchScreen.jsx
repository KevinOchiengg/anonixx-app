/** One search box over every drop (components/search/AllSearch.jsx, backend search.py), same as
 * Web SearchPage.tsx. Nothing shows until you type or tap a mood. Recent searches stay on this device. */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Clock, Search, X } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import AllSearch from '../../components/search/AllSearch';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import T from '../../utils/theme';

const HISTORY_KEY = '@anonixx_search_history';
const MAX_HISTORY = 8;

export default function SearchScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const likeId = route?.params?.like || null;
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then((h) => { if (h) setHistory(JSON.parse(h)); }).catch(() => {});
  }, []);

  const saveHistory = (list) => { setHistory(list); AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(list)).catch(() => {}); };
  const remember = (q = query) => {
    const t = q.trim();
    if (t.length < 2) return;
    saveHistory([t, ...history.filter((h) => h.toLowerCase() !== t.toLowerCase())].slice(0, MAX_HISTORY));
  };
  const pick = (q) => { setQuery(q); remember(q); };

  const idle = !query.trim() && !likeId;
  const recent = idle && history.length > 0 ? (
    <View style={styles.recent}>
      <View style={styles.sectionRow}>
        <Text style={styles.section}>Recent</Text>
        <TouchableOpacity onPress={() => saveHistory([])} hitSlop={HIT_SLOP}><Text style={styles.clear}>Clear</Text></TouchableOpacity>
      </View>
      {history.map((h) => (
        <TouchableOpacity key={h} style={styles.histRow} onPress={() => setQuery(h)} activeOpacity={0.7}>
          <Clock size={rs(15)} color={T.textSecondary} />
          <Text style={styles.histText} numberOfLines={1}>{h}</Text>
          <TouchableOpacity onPress={() => saveHistory(history.filter((x) => x !== h))} hitSlop={HIT_SLOP} accessibilityLabel={`Remove ${h}`}>
            <X size={rs(14)} color={T.textMute} />
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
    </View>
  ) : null;

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
            onSubmitEditing={() => remember()}
            placeholder="Search videos, confessions, people…"
            placeholderTextColor={T.textMute}
            returnKeyType="search"
            autoCorrect={false}
            autoFocus={!likeId}
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={HIT_SLOP} accessibilityLabel="Clear search">
              <X size={rs(16)} color={T.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <AllSearch
        query={query}
        signedIn={isAuthenticated}
        navigation={navigation}
        header={recent}
        likeId={likeId}
        onClearLike={() => navigation.setParams({ like: undefined })}
        onPick={pick}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: rp(6), paddingBottom: rp(10), gap: SPACING.sm },
  backBtn: { width: rs(36), height: rs(36), alignItems: 'center', justifyContent: 'center' },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: rp(9), backgroundColor: T.surfaceAlt, borderRadius: RADIUS.full || 999, paddingHorizontal: rp(14), height: rs(42) },
  input: { flex: 1, color: T.text, fontSize: FONT.md },
  recent: { paddingHorizontal: rs(14), paddingBottom: rp(6) },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: rp(8) },
  section: { color: T.textSecondary, fontSize: rf(11), fontWeight: '800', letterSpacing: 0.6 },
  clear: { color: T.primary, fontSize: rf(12), fontWeight: '700' },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: rp(10), paddingVertical: rp(10) },
  histText: { flex: 1, color: T.text, fontSize: FONT.sm },
});
