/**
 * FeedLocationScreen.jsx
 *
 * Lets a user set their home location and choose how tightly the main
 * feed is scoped to it — Everyone (off) / Country / Region / Neighborhood.
 * Reuses the same structured location capture Drops already use
 * (LocationField — country -> county -> sub_county -> estate) so the two
 * features share one mental model.
 *
 * Posts with no location of their own always still show, regardless of
 * scope — this only narrows the feed toward "home," it never empties it.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, MapPin } from 'lucide-react-native';

import LocationField from '../../components/drops/LocationField';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

const SCOPE_OPTIONS = [
  { id: 'off',        label: 'Everyone',      sub: 'No location filter' },
  { id: 'country',    label: 'Country',       sub: 'Same country as you' },
  { id: 'county',     label: 'Region',        sub: 'Same county / state' },
  { id: 'sub_county', label: 'Area',          sub: 'Same sub-county / district' },
  { id: 'estate',     label: 'Neighborhood',  sub: 'Same estate — closest match' },
];

export default function FeedLocationScreen({ navigation }) {
  const insets        = useSafeAreaInsets();
  const { showToast } = useToast();
  const { user, updateUserProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  const [country,    setCountry]    = useState('');
  const [county,     setCounty]     = useState('');
  const [subCounty,  setSubCounty]  = useState('');
  const [estate,     setEstate]     = useState('');
  const [scope,      setScope]      = useState('off');

  // Load current values — prefer the cached user object, fall back to a
  // fresh fetch so this stays accurate even if the cache is stale.
  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const res   = await fetch(`${API_BASE_URL}/api/v1/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCountry(data.location_country || '');
          setCounty(data.location_county || '');
          setSubCounty(data.location_sub_county || '');
          setEstate(data.location_estate || '');
          setScope(data.feed_location_scope || 'off');
        }
      } catch {
        // Fall back silently to whatever's cached on the user object.
        setCountry(user?.location_country || '');
        setCounty(user?.location_county || '');
        setSubCounty(user?.location_sub_county || '');
        setEstate(user?.location_estate || '');
        setScope(user?.feed_location_scope || 'off');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scopeNeedsLevel = {
    country: !!country.trim(),
    county: !!country.trim() && !!county.trim(),
    sub_county: !!country.trim() && !!county.trim() && !!subCounty.trim(),
    estate: !!country.trim() && !!county.trim() && !!subCounty.trim() && !!estate.trim(),
  };

  const handleSelectScope = useCallback((id) => {
    if (id !== 'off' && !scopeNeedsLevel[id]) {
      showToast({
        type: 'warning',
        message: 'Fill in your location down to that level first.',
      });
      return;
    }
    setScope(id);
  }, [scopeNeedsLevel, showToast]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const body  = {
        location_country:    country.trim(),
        location_county:     county.trim(),
        location_sub_county: subCounty.trim(),
        location_estate:     estate.trim(),
        feed_location_scope: scope,
      };
      const res = await fetch(`${API_BASE_URL}/api/v1/users/me`, {
        method:  'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();

      await updateUserProfile(body);
      showToast({ type: 'success', message: 'Feed location updated.' });
      // Jump back to the feed itself (not just goBack) so it refetches
      // with the new scope immediately, rather than showing a stale list
      // until the user manually pulls to refresh.
      navigation.navigate('Main', {
        screen: 'Feed',
        params: { screen: 'FeedMain', params: { refresh: Date.now() } },
      });
    } catch {
      showToast({ type: 'error', message: 'Could not save. Try again.' });
    } finally {
      setSaving(false);
    }
  }, [country, county, subCounty, estate, scope, updateUserProfile, showToast, navigation]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top ? 0 : rp(12) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={HIT_SLOP}>
          <ArrowLeft size={rs(20)} color={T.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Feed Location</Text>
        <View style={s.backBtn} />
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={T.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + rp(40) }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.introRow}>
            <MapPin size={rs(16)} color={T.primary} />
            <Text style={s.introText}>
              Set where you are, then choose how close the feed sticks to it.
              Drops with no location of their own always still show.
            </Text>
          </View>

          <Text style={s.sectionLabel}>Your location</Text>
          <LocationField
            country={country}
            county={county}
            subCounty={subCounty}
            estate={estate}
            onChangeCountry={setCountry}
            onChangeCounty={setCounty}
            onChangeSubCounty={setSubCounty}
            onChangeEstate={setEstate}
          />

          <Text style={[s.sectionLabel, { marginTop: SPACING.lg }]}>Show me drops from</Text>
          <View style={s.scopeList}>
            {SCOPE_OPTIONS.map((opt) => {
              const disabled = opt.id !== 'off' && !scopeNeedsLevel[opt.id];
              const active   = scope === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[s.scopeRow, active && s.scopeRowActive, disabled && s.scopeRowDisabled]}
                  onPress={() => handleSelectScope(opt.id)}
                  activeOpacity={0.8}
                >
                  <View style={[s.radio, active && s.radioActive]}>
                    {active && <View style={s.radioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.scopeLabel, active && { color: T.primary }]}>{opt.label}</Text>
                    <Text style={s.scopeSub}>{opt.sub}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[s.saveBtn, saving && s.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.saveBtnText}>Save</Text>}
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(12),
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  backBtn: {
    width:           rs(36),
    height:          rs(36),
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    rs(18),
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  headerTitle: { fontSize: FONT.md, fontWeight: '700', color: T.text },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content:     { paddingHorizontal: SPACING.md, paddingTop: SPACING.lg },

  introRow: {
    flexDirection:     'row',
    gap:               rp(10),
    backgroundColor:   'rgba(255,99,74,0.06)',
    borderWidth:       1,
    borderColor:       'rgba(255,99,74,0.2)',
    borderRadius:      RADIUS.md,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
    marginBottom:      SPACING.lg,
  },
  introText: {
    flex:       1,
    fontFamily: 'DMSans-Regular',
    fontSize:   rf(12),
    color:      T.textSecondary,
    lineHeight: rf(18),
  },

  sectionLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(11),
    color:         T.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom:  rp(10),
  },

  scopeList: { gap: rp(8) },
  scopeRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(12),
    backgroundColor:   T.surface,
    borderWidth:       1,
    borderColor:       T.border,
    borderRadius:      RADIUS.md,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
  },
  scopeRowActive:   { borderColor: T.primary, backgroundColor: 'rgba(255,99,74,0.07)' },
  scopeRowDisabled: { opacity: 0.45 },
  radio: {
    width:           rs(18),
    height:          rs(18),
    borderRadius:    rs(9),
    borderWidth:     1.5,
    borderColor:     T.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  radioActive: { borderColor: T.primary },
  radioDot: {
    width:           rs(9),
    height:          rs(9),
    borderRadius:    rs(4.5),
    backgroundColor: T.primary,
  },
  scopeLabel: { fontFamily: 'DMSans-Bold',    fontSize: FONT.sm, color: T.text },
  scopeSub:   { fontFamily: 'DMSans-Regular', fontSize: rf(11), color: T.textMuted, marginTop: rp(2) },

  saveBtn: {
    marginTop:       SPACING.lg,
    height:          rs(50),
    borderRadius:    RADIUS.md,
    backgroundColor: T.primary,
    alignItems:      'center',
    justifyContent:  'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.md,
    color:         '#fff',
    letterSpacing: 0.5,
  },
});
