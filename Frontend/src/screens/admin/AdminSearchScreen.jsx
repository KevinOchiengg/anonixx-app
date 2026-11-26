/** Search admin (same as Web app/admin/search): quality numbers, searches nobody found anything
 * for, blocked searches, and the slang list. */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { rs, rf, rp, SPACING, FONT, RADIUS } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import T from '../../utils/theme';
import { apiFetch, AdminHeader, a } from './adminShared';

const PANES = [['quality', 'Quality'], ['unmet', "Can't find"], ['blocked', 'Blocked'], ['slang', 'Slang']];
const DAYS = [1, 7, 30];
const pct = (n) => `${Math.round((n || 0) * 100)}%`;

export default function AdminSearchScreen({ navigation }) {
  const { showToast } = useToast();
  const [pane, setPane] = useState('quality');
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setData(null);
    setError('');
    const path = {
      quality: `/search/admin/stats?days=${days}`,
      unmet: `/search/admin/unmet?days=${days}`,
      blocked: '/search/admin/flags',
      slang: '/search/admin/synonyms',
    }[pane];
    const { ok, data: d } = await apiFetch(path);
    if (ok) setData(d);
    else setError(d?.detail || "Couldn't load this.");
  }, [pane, days]);
  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={a.safe} edges={['top']}>
      <AdminHeader title="Search" onBack={() => navigation.goBack()} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {PANES.map(([k, l]) => <Chip key={k} label={l} on={pane === k} onPress={() => setPane(k)} />)}
      </ScrollView>
      {(pane === 'quality' || pane === 'unmet') && (
        <View style={[s.chips, { paddingTop: 0 }]}>
          {DAYS.map((d) => <Chip key={d} label={d === 1 ? 'Today' : `${d} days`} on={days === d} onPress={() => setDays(d)} small />)}
        </View>
      )}
      <ScrollView contentContainerStyle={a.listContent} keyboardShouldPersistTaps="handled">
        {error ? <Text style={s.err}>{error}</Text> : !data ? <ActivityIndicator color={T.primary} style={{ marginTop: rs(30) }} /> : (
          <>
            {pane === 'quality' && <Quality data={data} />}
            {pane === 'unmet' && <Unmet rows={data.unmet || []} />}
            {pane === 'blocked' && <Blocked rows={data.flags || []} onDone={load} />}
            {pane === 'slang' && <Slang rows={data.synonyms || []} topics={data.topics || []} onChange={load} showToast={showToast} />}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ label, on, onPress, small }) {
  return (
    <TouchableOpacity style={[s.chip, small && s.chipSmall, on && s.chipOn]} onPress={onPress} activeOpacity={0.8} accessibilityState={{ selected: !!on }}>
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Quality({ data }) {
  const arms = Object.entries(data.arms || {});
  return (
    <>
      {!arms.length && <Text style={a.emptyText}>No searches in this period yet.</Text>}
      {arms.map(([arm, x]) => (
        <View key={arm} style={a.card}>
          <Text style={a.cardTitle}>{arms.length > 1 ? `Ranking ${arm.toUpperCase()}` : 'All searches'}</Text>
          <Stat label="Searches" value={x.searches.toLocaleString()} />
          <Stat label="Found nothing" value={pct(x.zero_result_rate)} />
          <Stat label="Tapped a result" value={pct(x.tap_rate)} />
          <Stat label="Time to first tap" value={x.median_seconds_to_first_tap == null ? '—' : `${x.median_seconds_to_first_tap}s`} />
        </View>
      ))}
      {(data.top || []).length > 0 && (
        <View style={a.card}>
          <Text style={a.cardTitle}>Top searches</Text>
          {data.top.map((t) => <Stat key={t.q} label={t.q} value={String(t.searches)} />)}
        </View>
      )}
    </>
  );
}

function Stat({ label, value }) {
  return (
    <View style={s.stat}>
      <Text style={a.cardBody} numberOfLines={1}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

function Unmet({ rows }) {
  if (!rows.length) return <Text style={a.emptyText}>Nothing unmet. Search is finding what people want.</Text>;
  return (
    <>
      <Text style={a.cardBody}>Post drops for these, or add slang so they match what's there.</Text>
      {rows.map((r) => (
        <View key={r.q} style={a.card}>
          <Text style={a.cardTitle}>{r.q}</Text>
          <Text style={a.cardMeta}>{r.people} {r.people === 1 ? 'person' : 'people'} · {r.searches} searches · {r.no_results ? 'no results' : 'results, no taps'}</Text>
        </View>
      ))}
    </>
  );
}

function Blocked({ rows, onDone }) {
  if (!rows.length) return <Text style={a.emptyText}>No blocked searches waiting.</Text>;
  const review = async (id) => { await apiFetch(`/search/admin/flags/${id}`, { method: 'PATCH' }); onDone(); };
  return (
    <>
      <Text style={a.cardBody}>Searches for illegal content. They returned nothing.</Text>
      {rows.map((f) => (
        <View key={f.id} style={a.card}>
          <Text style={a.cardTitle}>{f.query}</Text>
          <Text style={a.cardMeta}>matched “{f.term}” · {new Date(f.at).toLocaleString()}</Text>
          <View style={a.actionRow}>
            <TouchableOpacity style={a.btn} onPress={() => review(f.id)} activeOpacity={0.85}><Text style={a.btnText}>Reviewed</Text></TouchableOpacity>
          </View>
        </View>
      ))}
    </>
  );
}

function Slang({ rows, topics, onChange, showToast }) {
  const [term, setTerm] = useState('');
  const [expands, setExpands] = useState('');
  const [picked, setPicked] = useState([]);
  const [editId, setEditId] = useState(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setEditId(null); setTerm(''); setExpands(''); setPicked([]); };
  const edit = (x) => { setEditId(x.id); setTerm(x.term); setExpands(x.expands.join(', ')); setPicked(x.topics); };

  const save = async () => {
    setBusy(true);
    const body = { term, expands: expands.split(',').map((v) => v.trim()).filter(Boolean), topics: picked, active: true };
    const { ok, data } = editId
      ? await apiFetch(`/search/admin/synonyms/${editId}`, { method: 'PUT', body })
      : await apiFetch('/search/admin/synonyms', { method: 'POST', body });
    setBusy(false);
    if (!ok) { showToast({ type: 'error', message: data?.detail || "Couldn't save it." }); return; }
    showToast({ type: 'success', message: editId ? 'Saved.' : 'Added.' });
    reset();
    onChange();
  };

  const remove = (x) => Alert.alert(`Remove “${x.term}”?`, 'Searches for it stop matching these words.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => { await apiFetch(`/search/admin/synonyms/${x.id}`, { method: 'DELETE' }); onChange(); } },
  ]);

  return (
    <>
      <View style={a.card}>
        <Text style={a.cardTitle}>{editId ? `Edit “${term}”` : 'Add a word'}</Text>
        <TextInput style={s.input} value={term} onChangeText={setTerm} placeholder="Word people type, e.g. fwb" placeholderTextColor={T.textMuted} autoCapitalize="none" />
        <TextInput style={s.input} value={expands} onChangeText={setExpands} placeholder="Means the same as, comma separated" placeholderTextColor={T.textMuted} autoCapitalize="none" />
        <View style={s.wrap}>
          {topics.map((t) => (
            <Chip key={t.id} label={t.label} small on={picked.includes(t.id)}
              onPress={() => setPicked((p) => (p.includes(t.id) ? p.filter((v) => v !== t.id) : p.length < 5 ? [...p, t.id] : p))} />
          ))}
        </View>
        <View style={a.actionRow}>
          <TouchableOpacity style={[a.btn, a.btnPrimary]} onPress={save} disabled={busy || term.trim().length < 2} activeOpacity={0.85}>
            <Text style={[a.btnText, { color: '#fff' }]}>{busy ? 'Saving…' : editId ? 'Save' : 'Add'}</Text>
          </TouchableOpacity>
          {editId && <TouchableOpacity style={a.btn} onPress={reset} activeOpacity={0.85}><Text style={a.btnText}>Cancel</Text></TouchableOpacity>}
        </View>
      </View>
      {rows.map((x) => (
        <View key={x.id} style={a.card}>
          <Text style={a.cardTitle}>{x.term}</Text>
          <Text style={a.cardBody}>{x.expands.join(', ') || '—'}</Text>
          {x.topics.length > 0 && <Text style={a.cardMeta}>{x.topics.join(', ')}</Text>}
          <View style={a.actionRow}>
            <TouchableOpacity style={a.btn} onPress={() => edit(x)} activeOpacity={0.85}><Text style={a.btnText}>Edit</Text></TouchableOpacity>
            <TouchableOpacity style={[a.btn, a.btnDanger]} onPress={() => remove(x)} activeOpacity={0.85}><Text style={a.btnText}>Remove</Text></TouchableOpacity>
          </View>
        </View>
      ))}
    </>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', gap: rp(8), paddingHorizontal: SPACING.md, paddingVertical: rp(10) },
  chip: { paddingHorizontal: rp(14), paddingVertical: rp(8), borderRadius: RADIUS.full, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface },
  chipSmall: { paddingHorizontal: rp(10), paddingVertical: rp(5) },
  chipOn: { borderColor: T.primary, backgroundColor: T.primaryDim },
  chipText: { color: T.textSecondary, fontSize: rf(12), fontWeight: '700' },
  chipTextOn: { color: T.text },
  stat: { flexDirection: 'row', justifyContent: 'space-between', gap: rp(10) },
  statValue: { color: T.text, fontSize: FONT.sm, fontWeight: '800' },
  err: { color: T.primary, fontSize: FONT.sm, textAlign: 'center', marginTop: rs(30) },
  input: {
    color: T.text, fontSize: FONT.sm, backgroundColor: T.surfaceAlt, borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: T.border, paddingHorizontal: rp(10), paddingVertical: rp(8),
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(6) },
});
