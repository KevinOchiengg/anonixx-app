/**
 * GifPicker.jsx
 * Shared Tenor GIF search grid — used by the main feed's comment sheet and
 * Circle comments. Extracted from PostDetailScreen.jsx so both surfaces
 * share one implementation instead of duplicating it.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, TextInput, TouchableOpacity, Image, ScrollView,
  ActivityIndicator, StyleSheet, Dimensions,
} from 'react-native';
import { rp, RADIUS, FONT, HIT_SLOP } from '../../utils/responsive';
import { TENOR_API_KEY } from '../../config/api';
import T from '../../utils/theme';

const { width: W } = Dimensions.get('window');

const GifPicker = React.memo(({ onSelect }) => {
  const [query,   setQuery]   = useState('');
  const [gifs,    setGifs]    = useState([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    searchGifs('');
    setTimeout(() => searchRef.current?.focus(), 150);
  }, []);

  const searchGifs = useCallback(async (q) => {
    setLoading(true);
    try {
      const endpoint = q.trim()
        ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${TENOR_API_KEY}&limit=20&media_filter=gif`
        : `https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&limit=20&media_filter=gif`;
      const res  = await fetch(endpoint);
      const data = await res.json();
      setGifs(data.results ?? []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  const handleSearch = useCallback((t) => {
    setQuery(t);
    if (t.length === 0 || t.length >= 2) searchGifs(t);
  }, [searchGifs]);

  return (
    <View style={styles.pickerPanel}>
      <View style={styles.gifSearchRow}>
        <TextInput ref={searchRef} value={query} onChangeText={handleSearch}
          placeholder="Search GIFs…" placeholderTextColor={T.textMuted}
          style={styles.gifSearchInput} returnKeyType="search"
          onSubmitEditing={() => searchGifs(query)} />
      </View>
      {loading ? (
        <View style={styles.gifLoading}><ActivityIndicator color={T.primary} size="small" /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} style={styles.gifGrid} keyboardShouldPersistTaps="handled">
          <View style={styles.gifGridInner}>
            {gifs.map((gif, i) => {
              const url = gif.media_formats?.gif?.url ?? gif.media_formats?.tinygif?.url;
              if (!url) return null;
              return (
                <TouchableOpacity key={gif.id ?? i} onPress={() => onSelect(url)}
                  hitSlop={HIT_SLOP} activeOpacity={0.85} style={styles.gifThumb}>
                  <Image source={{ uri: url }} style={styles.gifThumbImg} resizeMode="cover" />
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
});

export default GifPicker;

const styles = StyleSheet.create({
  pickerPanel:    { backgroundColor: T.surfaceAlt, borderTopWidth: 1, borderTopColor: T.border, maxHeight: rp(220) },
  gifSearchRow:   { paddingHorizontal: rp(12), paddingVertical: rp(8), borderBottomWidth: 1, borderBottomColor: T.border },
  gifSearchInput: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: RADIUS.sm, paddingHorizontal: rp(12), paddingVertical: rp(8), fontSize: FONT.sm, color: T.text, borderWidth: 1, borderColor: T.border },
  gifLoading:     { height: rp(100), alignItems: 'center', justifyContent: 'center' },
  gifGrid:        { flex: 1 },
  gifGridInner:   { flexDirection: 'row', flexWrap: 'wrap', padding: rp(4), gap: rp(4) },
  gifThumb:       { width: (W - rp(32)) / 3, height: rp(80), borderRadius: RADIUS.sm, overflow: 'hidden', backgroundColor: T.surface },
  gifThumbImg:    { width: '100%', height: '100%' },
});
