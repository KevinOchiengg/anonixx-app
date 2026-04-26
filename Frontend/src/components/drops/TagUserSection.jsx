/**
 * TagUserSection.jsx
 *
 * "Tag Someone" UI used in DropsComposeScreen and ShareCardScreen.
 *
 * Behaviour:
 *   1. On mount, fetches the user's recent drop-chat partners from
 *      GET /api/v1/drops/connections (up to 5 unique users).
 *      These appear as tappable avatar chips — one tap tags them instantly,
 *      no typing required.
 *
 *   2. Below the recent chips sits a live-search input that queries
 *      GET /api/v1/users/search?q=... with a 200ms debounce. Results
 *      appear in a floating dropdown; tapping a row tags them.
 *
 *   3. Once a user is tagged a confirmation strip replaces the dropdown.
 *      The parent receives the selected user via onTag / onClear callbacks.
 *
 * Props:
 *   taggedUser   — currently tagged user object (or null)
 *   onTag(user)  — called when user is selected
 *   onClear()    — called when tag is cleared
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Keyboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Search, User, X } from 'lucide-react-native';

import { T } from '../../utils/colorTokens';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { API_BASE_URL } from '../../config/api';

// ─── Recent avatar chip ───────────────────────────────────────
const RecentChip = React.memo(function RecentChip({ user, active, onPress }) {
  const initial = (user.anonymous_name || user.username)?.[0]?.toUpperCase() || '?';
  return (
    <TouchableOpacity
      style={[s.recentChip, active && s.recentChipActive]}
      onPress={onPress}
      activeOpacity={0.75}
      hitSlop={HIT_SLOP}
    >
      <View style={[s.recentAvatar, active && s.recentAvatarActive]}>
        <Text style={[s.recentInitial, active && s.recentInitialActive]}>
          {initial}
        </Text>
      </View>
      <Text style={[s.recentName, active && { color: T.primary }]} numberOfLines={1}>
        @{user.username}
      </Text>
    </TouchableOpacity>
  );
});

// ─── Main component ───────────────────────────────────────────
export default function TagUserSection({ taggedUser, onTag, onClear }) {
  const [recentUsers,   setRecentUsers]   = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);

  const [userQuery,     setUserQuery]     = useState('');
  const [userResults,   setUserResults]   = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef(null);

  // ── Fetch recent drop-chat partners on mount ──────────────────
  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) { setRecentLoading(false); return; }

        const res = await fetch(`${API_BASE_URL}/api/v1/drops/connections?limit=20`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) { setRecentLoading(false); return; }

        const data = await res.json();
        const connections = data?.connections || data?.items || data || [];

        // Extract the "other" user from each connection.
        // Handles: { other_user }, { partner_user }, { partner }, { unlocker }, { sender }
        const seen = new Set();
        const users = [];
        for (const conn of connections) {
          const u =
            conn.other_user   ||
            conn.partner_user ||
            conn.partner      ||
            conn.unlocker     ||
            conn.sender;
          if (u?.id && !seen.has(u.id)) {
            seen.add(u.id);
            users.push({ id: u.id, username: u.username, anonymous_name: u.anonymous_name });
          }
          if (users.length >= 5) break;
        }
        setRecentUsers(users);
      } catch {
        /* silent — section just stays empty */
      } finally {
        setRecentLoading(false);
      }
    })();
  }, []);

  // ── Live search ───────────────────────────────────────────────
  const handleSearch = useCallback((q) => {
    setUserQuery(q);
    clearTimeout(searchTimer.current);
    if (!q.trim()) { setUserResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        const res   = await fetch(
          `${API_BASE_URL}/api/v1/users/search?q=${encodeURIComponent(q.trim())}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const data = await res.json();
          setUserResults(data.users || []);
        }
      } catch { /* silent */ }
      finally { setSearchLoading(false); }
    }, 200);
  }, []);

  const handleSelect = useCallback((u) => {
    onTag(u);
    setUserQuery(u.username);
    setUserResults([]);
    Keyboard.dismiss();
  }, [onTag]);

  const handleClear = useCallback(() => {
    onClear();
    setUserQuery('');
    setUserResults([]);
  }, [onClear]);

  // ─────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <Text style={s.eyebrow}>
        TAG SOMEONE · <Text style={s.eyebrowMute}>optional</Text>
      </Text>
      <Text style={s.subText}>
        Hits the marketplace. If you tag someone they also receive it — anonymously.
      </Text>

      {/* Recent partners */}
      {recentLoading ? (
        <ActivityIndicator size="small" color={T.primary} style={{ alignSelf: 'flex-start', marginVertical: rp(6) }} />
      ) : recentUsers.length > 0 ? (
        <View style={s.recentSection}>
          <Text style={s.recentLabel}>RECENT</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.recentScroll}
            keyboardShouldPersistTaps="handled"
          >
            {recentUsers.map((u) => (
              <RecentChip
                key={u.id}
                user={u}
                active={taggedUser?.id === u.id}
                onPress={() => taggedUser?.id === u.id ? handleClear() : handleSelect(u)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Search input */}
      <View style={s.searchRow}>
        <Search size={rs(15)} color={T.textMute} />
        <TextInput
          style={s.searchInput}
          value={userQuery}
          onChangeText={handleSearch}
          placeholder="Search by username or anon name…"
          placeholderTextColor={T.textMute}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchLoading
          ? <ActivityIndicator size="small" color={T.primary} />
          : userQuery.length > 0 && (
            <TouchableOpacity onPress={handleClear} hitSlop={HIT_SLOP}>
              <X size={rs(14)} color={T.textMute} />
            </TouchableOpacity>
          )
        }
      </View>

      {/* Search results dropdown */}
      {userResults.length > 0 && !taggedUser && (
        <View style={s.dropdown}>
          {userResults.map((u, idx) => (
            <TouchableOpacity
              key={u.id}
              style={[
                s.dropdownItem,
                idx === userResults.length - 1 && { borderBottomWidth: 0 },
              ]}
              onPress={() => handleSelect(u)}
              activeOpacity={0.7}
            >
              <View style={s.dropdownAvatar}>
                <Text style={s.dropdownInitial}>
                  {(u.anonymous_name || u.username)?.[0]?.toUpperCase() || '?'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.dropdownName}>@{u.username}</Text>
                {u.anonymous_name
                  ? <Text style={s.dropdownAnon}>{u.anonymous_name}</Text>
                  : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* No results */}
      {!searchLoading && userQuery.length > 0 && userResults.length === 0 && !taggedUser && (
        <Text style={s.noResults}>No users found for "{userQuery}"</Text>
      )}

      {/* Confirmed tag strip */}
      {taggedUser && (
        <View style={s.confirmStrip}>
          <User size={rs(13)} color={T.primary} />
          <Text style={s.confirmText}>
            Also sending to{' '}
            <Text style={{ color: T.primary, fontFamily: 'DMSans-Bold' }}>
              @{taggedUser.username}
            </Text>
            {' '}anonymously
          </Text>
          <TouchableOpacity onPress={handleClear} hitSlop={HIT_SLOP}>
            <X size={rs(14)} color={T.textMute} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    gap: rp(10),
  },

  eyebrow: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10),
    color:         T.textSec,
    letterSpacing: 2.2,
  },
  eyebrowMute: {
    fontFamily:    'DMSans-Italic',
    color:         T.textMute,
    letterSpacing: 1.4,
  },
  subText: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textMute,
    letterSpacing: 0.3,
    lineHeight:    rf(17),
    marginTop:     rp(-4),
  },

  // Recent section
  recentSection: { gap: rp(6) },
  recentLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(9),
    color:         T.textMute,
    letterSpacing: 2.5,
  },
  recentScroll: {
    gap:            rp(10),
    paddingVertical: rp(2),
    paddingRight:   rp(4),
  },
  recentChip: {
    alignItems: 'center',
    gap:        rp(5),
    width:      rs(56),
  },
  recentChipActive: {},
  recentAvatar: {
    width:           rs(44),
    height:          rs(44),
    borderRadius:    rs(22),
    backgroundColor: 'rgba(255,99,74,0.10)',
    borderWidth:     1.5,
    borderColor:     T.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  recentAvatarActive: {
    borderColor:     T.primary,
    backgroundColor: 'rgba(255,99,74,0.18)',
  },
  recentInitial: {
    fontFamily: 'DMSans-Bold',
    fontSize:   rf(16),
    color:      T.textSec,
  },
  recentInitialActive: { color: T.primary },
  recentName: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(10),
    color:         T.textMute,
    letterSpacing: 0.3,
    textAlign:     'center',
  },

  // Search input
  searchRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(8),
    backgroundColor:   T.surface,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
    paddingHorizontal: rp(12),
    paddingVertical:   rp(10),
  },
  searchInput: {
    flex:            1,
    fontFamily:      'DMSans-Regular',
    fontSize:        FONT.md,
    color:           T.text,
    paddingVertical: 0,
  },

  // Dropdown
  dropdown: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     T.border,
    overflow:        'hidden',
    maxHeight:       rs(220),
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: rs(4) },
    shadowOpacity:   0.3,
    shadowRadius:    rs(10),
    elevation:       10,
  },
  dropdownItem: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(10),
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  dropdownAvatar: {
    width:           rs(34),
    height:          rs(34),
    borderRadius:    rs(17),
    backgroundColor: 'rgba(255,99,74,0.12)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  dropdownInitial: { fontFamily: 'DMSans-Bold',   fontSize: rf(14), color: T.primary },
  dropdownName:    { fontFamily: 'DMSans-Bold',   fontSize: FONT.sm, color: T.text },
  dropdownAnon:    { fontFamily: 'DMSans-Italic', fontSize: rf(11), color: T.textMute, marginTop: rp(1) },
  noResults: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textMute,
    paddingVertical: rp(4),
  },

  // Confirmed strip
  confirmStrip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(8),
    backgroundColor:   'rgba(255,99,74,0.06)',
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       'rgba(255,99,74,0.2)',
    paddingHorizontal: rp(12),
    paddingVertical:   rp(10),
  },
  confirmText: {
    flex:       1,
    fontFamily: 'DMSans-Regular',
    fontSize:   rf(12),
    color:      T.textSec,
    lineHeight: rf(18),
  },
});
