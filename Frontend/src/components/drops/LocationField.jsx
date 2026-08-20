/**
 * LocationField.jsx
 *
 * Structured location capture for Drops — Country → County/State →
 * Sub-county → Estate/Area, most-specific to least. Only country and
 * county are backed by a real fixed list (Kenya's 47 counties, the app's
 * primary market — see config/locations.js); sub-county and estate stay
 * freeform text everywhere, since no reliable exhaustive dataset exists
 * for either at that level of granularity.
 *
 * Every field is optional — this is a "where are you?" hint, not a
 * required field, matching how it worked before (a single freeform text
 * input) just with real structure now.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, FlatList, StyleSheet,
} from 'react-native';
import { ChevronDown, Search, X } from 'lucide-react-native';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import T from '../../utils/theme';
import { COUNTRIES, KENYA_COUNTIES } from '../../config/locations';

// ─── Reusable searchable picker sheet — also used by SearchScreen's
// drops location filter, so it's exported rather than kept private. ──
export function PickerModal({ visible, title, options, onSelect, onClose }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={pm.overlay}>
        <View style={pm.sheet}>
          <View style={pm.header}>
            <Text style={pm.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={HIT_SLOP}>
              <X size={rs(20)} color={T.textMute} />
            </TouchableOpacity>
          </View>
          <View style={pm.searchWrap}>
            <Search size={rs(14)} color={T.textMute} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="search…"
              placeholderTextColor={T.textMute}
              style={pm.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: rs(360) }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={pm.row}
                onPress={() => { onSelect(item); setSearch(''); onClose(); }}
                activeOpacity={0.75}
              >
                <Text style={pm.rowText}>{item}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={pm.empty}>nothing matches "{search}"</Text>}
          />
        </View>
      </View>
    </Modal>
  );
}

export default function LocationField({
  country, county, subCounty, estate,
  onChangeCountry, onChangeCounty, onChangeSubCounty, onChangeEstate,
}) {
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [countyPickerOpen, setCountyPickerOpen] = useState(false);

  const kenya = isKenya_ByName(country);
  const countryNames = useMemo(() => COUNTRIES.map((c) => c.name), []);

  const handleSelectCountry = (name) => {
    onChangeCountry(name);
    // Switching away from Kenya invalidates a picked county — it was drawn
    // from KENYA_COUNTIES and won't mean anything as freeform state/region text.
    if (!isKenya_ByName(name) && county) onChangeCounty('');
  };

  return (
    <View>
      {/* Country */}
      <Text style={s.label}>Country</Text>
      <TouchableOpacity style={s.field} onPress={() => setCountryPickerOpen(true)} activeOpacity={0.8}>
        <Text style={[s.fieldText, !country && s.fieldPlaceholder]}>
          {country || 'Select a country'}
        </Text>
        <ChevronDown size={rs(15)} color={T.textMute} />
      </TouchableOpacity>

      {/* County (Kenya, picker) or State/Region (everywhere else, freeform) */}
      <Text style={s.label}>{kenya ? 'County' : 'State / Region'}</Text>
      {kenya ? (
        <TouchableOpacity style={s.field} onPress={() => setCountyPickerOpen(true)} activeOpacity={0.8}>
          <Text style={[s.fieldText, !county && s.fieldPlaceholder]}>
            {county || 'Select a county'}
          </Text>
          <ChevronDown size={rs(15)} color={T.textMute} />
        </TouchableOpacity>
      ) : (
        <TextInput
          value={county}
          onChangeText={onChangeCounty}
          placeholder="e.g. California"
          placeholderTextColor={T.textMute}
          style={s.textField}
          maxLength={60}
        />
      )}

      {/* Sub-county / district — freeform */}
      <Text style={s.label}>{kenya ? 'Sub-county' : 'District / Area'}</Text>
      <TextInput
        value={subCounty}
        onChangeText={onChangeSubCounty}
        placeholder={kenya ? 'e.g. Westlands' : 'e.g. Downtown'}
        placeholderTextColor={T.textMute}
        style={s.textField}
        maxLength={60}
      />

      {/* Estate / neighborhood — freeform */}
      <Text style={s.label}>Estate / Neighborhood</Text>
      <TextInput
        value={estate}
        onChangeText={onChangeEstate}
        placeholder="e.g. Kilimani"
        placeholderTextColor={T.textMute}
        style={s.textField}
        maxLength={60}
      />

      <PickerModal
        visible={countryPickerOpen}
        title="Country"
        options={countryNames}
        onSelect={handleSelectCountry}
        onClose={() => setCountryPickerOpen(false)}
      />
      <PickerModal
        visible={countyPickerOpen}
        title="County"
        options={KENYA_COUNTIES}
        onSelect={onChangeCounty}
        onClose={() => setCountyPickerOpen(false)}
      />
    </View>
  );
}

// Matches by display name since the field stores/edits the readable name,
// not the ISO code — keeps the parent screen's state simple (just strings).
function isKenya_ByName(name) {
  return (name || '').trim().toLowerCase() === 'kenya';
}

const s = StyleSheet.create({
  label: {
    fontFamily: 'DMSans-Bold',
    fontSize: rf(10),
    color: T.textSec,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: rp(6),
    marginTop: rp(10),
  },
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: T.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: rp(12), paddingVertical: rp(12),
  },
  fieldText: { fontFamily: 'DMSans-Regular', fontSize: rf(14), color: T.text },
  fieldPlaceholder: { color: T.textMute },
  textField: {
    fontFamily: 'DMSans-Regular', fontSize: rf(14), color: T.text,
    backgroundColor: T.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: rp(12), paddingVertical: rp(10),
  },
});

const pm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: T.background, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: T.border, borderBottomWidth: 0,
    maxHeight: '75%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  title: { fontFamily: 'PlayfairDisplay-Bold', fontSize: rf(17), color: T.text },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: rp(8),
    backgroundColor: T.surface, borderRadius: RADIUS.full, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: rp(14), paddingVertical: rp(9), marginBottom: SPACING.sm,
  },
  searchInput: { flex: 1, fontSize: FONT.sm, color: T.text, paddingVertical: 0 },
  row: { paddingVertical: rp(13), borderBottomWidth: 1, borderBottomColor: T.border },
  rowText: { fontSize: FONT.sm, color: T.text },
  empty: { fontSize: FONT.sm, color: T.textMute, fontStyle: 'italic', textAlign: 'center', paddingVertical: SPACING.lg },
});
