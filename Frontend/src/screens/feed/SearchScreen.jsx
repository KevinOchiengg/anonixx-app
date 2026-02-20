import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Dimensions,
  Keyboard,
  Vibration,
} from 'react-native';
import {
  ArrowLeft,
  Search,
  X,
  Clock,
  TrendingUp,
  Filter,
  Calendar,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import CalmPostCard from '../../components/feed/CalmPostCard';
import { API_BASE_URL } from '../../config/api';

const { height, width } = Dimensions.get('window');

// NEW Cinematic Coral Theme
const THEME = {
  background: '#0b0f18',
  backgroundDark: '#06080f',
  surface: '#151924',
  surfaceDark: '#10131c',
  primary: '#FF634A',
  primaryDark: '#ff3b2f',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.05)',
  input: 'rgba(30, 35, 45, 0.7)',
};

// Starry Background Component
const StarryBackground = () => {
  const stars = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      top: Math.random() * height,
      left: Math.random() * width,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.6 + 0.2,
    }));
  }, []);

  return (
    <>
      {stars.map((star) => (
        <View
          key={star.id}
          style={{
            position: 'absolute',
            backgroundColor: THEME.primary,
            borderRadius: 50,
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
          }}
        />
      ))}
    </>
  );
};

const SEARCH_HISTORY_KEY = '@anonixx_search_history';

export default function SearchScreen({ navigation }) {
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchHistory, setSearchHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('all'); // all, recent, popular

  useEffect(() => {
    loadSearchHistory();
  }, []);

  const loadSearchHistory = async () => {
    try {
      const history = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
      if (history) {
        setSearchHistory(JSON.parse(history));
      }
    } catch (error) {
      console.error('Load search history error:', error);
    }
  };

  const saveSearchToHistory = async (query) => {
    try {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) return;

      // Remove duplicates and add to front
      const updatedHistory = [
        trimmedQuery,
        ...searchHistory.filter((q) => q !== trimmedQuery),
      ].slice(0, 10); // Keep last 10 searches

      setSearchHistory(updatedHistory);
      await AsyncStorage.setItem(
        SEARCH_HISTORY_KEY,
        JSON.stringify(updatedHistory)
      );
    } catch (error) {
      console.error('Save search history error:', error);
    }
  };

  const clearSearchHistory = async () => {
    try {
      setSearchHistory([]);
      await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
      Vibration.vibrate(10);
    } catch (error) {
      console.error('Clear search history error:', error);
    }
  };

  const handleSearch = async (query = searchQuery) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    Vibration.vibrate(10);
    setLoading(true);
    setHasSearched(true);
    Keyboard.dismiss();

    // Save to history
    await saveSearchToHistory(trimmedQuery);

    try {
      const token = await AsyncStorage.getItem('token');
      const headers = {};

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Build query params
      const params = new URLSearchParams({
        q: trimmedQuery,
        filter: selectedFilter,
      });

      const response = await fetch(
        `${API_BASE_URL}/api/v1/posts/search?${params}`,
        { headers }
      );

      const data = await response.json();

      if (response.ok) {
        setSearchResults(data.results || data.posts || []);
      } else {
        console.error('Search failed:', data);
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleHistoryItemPress = (query) => {
    setSearchQuery(query);
    handleSearch(query);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
    Vibration.vibrate(10);
  };

  const handlePostPress = (post) => {
    navigation.navigate('PostDetail', { post });
  };

  const handleResponse = useCallback(() => {
    // Handle response actions
  }, []);

  const handleSave = useCallback(() => {
    // Handle save actions
  }, []);

  const handleViewThread = useCallback((postId) => {
    navigation.navigate('ThreadView', { postId });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Header with Search Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={THEME.text} />
        </TouchableOpacity>

        <View style={styles.searchBarWrapper}>
          <View style={styles.searchAccentBar} />
          <View style={styles.searchBar}>
            <Search size={20} color={THEME.textSecondary} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search thoughts..."
              placeholderTextColor={THEME.textSecondary}
              style={styles.searchInput}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={() => handleSearch()}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={handleClearSearch}>
                <X size={20} color={THEME.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <TouchableOpacity
          onPress={() => setShowFilters(!showFilters)}
          style={styles.filterButton}
        >
          <Filter
            size={20}
            color={showFilters ? THEME.primary : THEME.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      {showFilters && (
        <View style={styles.filtersWrapper}>
          <View style={styles.filtersAccentBar} />
          <View style={styles.filters}>
            <TouchableOpacity
              onPress={() => setSelectedFilter('all')}
              style={[
                styles.filterChip,
                selectedFilter === 'all' && styles.filterChipActive,
              ]}
            >
              <TrendingUp
                size={16}
                color={
                  selectedFilter === 'all' ? THEME.primary : THEME.textSecondary
                }
              />
              <Text
                style={[
                  styles.filterChipText,
                  selectedFilter === 'all' && styles.filterChipTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setSelectedFilter('recent')}
              style={[
                styles.filterChip,
                selectedFilter === 'recent' && styles.filterChipActive,
              ]}
            >
              <Clock
                size={16}
                color={
                  selectedFilter === 'recent'
                    ? THEME.primary
                    : THEME.textSecondary
                }
              />
              <Text
                style={[
                  styles.filterChipText,
                  selectedFilter === 'recent' && styles.filterChipTextActive,
                ]}
              >
                Recent
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setSelectedFilter('popular')}
              style={[
                styles.filterChip,
                selectedFilter === 'popular' && styles.filterChipActive,
              ]}
            >
              <TrendingUp
                size={16}
                color={
                  selectedFilter === 'popular'
                    ? THEME.primary
                    : THEME.textSecondary
                }
              />
              <Text
                style={[
                  styles.filterChipText,
                  selectedFilter === 'popular' && styles.filterChipTextActive,
                ]}
              >
                Popular
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Search History / Suggestions */}
        {!hasSearched && searchHistory.length > 0 && (
          <View style={styles.historyWrapper}>
            <View style={styles.historyAccentBar} />
            <View style={styles.historySection}>
              <View style={styles.historyHeader}>
                <Clock size={18} color={THEME.primary} />
                <Text style={styles.historyTitle}>Recent Searches</Text>
                <TouchableOpacity onPress={clearSearchHistory}>
                  <Text style={styles.clearButton}>Clear</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.historyList}>
                {searchHistory.map((query, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => handleHistoryItemPress(query)}
                    style={styles.historyItem}
                  >
                    <Clock size={16} color={THEME.textSecondary} />
                    <Text style={styles.historyItemText}>{query}</Text>
                    <X
                      size={16}
                      color={THEME.textSecondary}
                      onPress={(e) => {
                        e.stopPropagation();
                        const updated = searchHistory.filter(
                          (q) => q !== query
                        );
                        setSearchHistory(updated);
                        AsyncStorage.setItem(
                          SEARCH_HISTORY_KEY,
                          JSON.stringify(updated)
                        );
                      }}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Search Suggestions (when no history) */}
        {!hasSearched && searchHistory.length === 0 && (
          <View style={styles.suggestionsWrapper}>
            <View style={styles.suggestionsAccentBar} />
            <View style={styles.suggestions}>
              <Text style={styles.suggestionsTitle}>Try searching for:</Text>
              <View style={styles.suggestionsList}>
                {['anxiety', 'loneliness', 'hope', 'gratitude', 'healing'].map(
                  (suggestion, index) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => {
                        setSearchQuery(suggestion);
                        handleSearch(suggestion);
                      }}
                      style={styles.suggestionChip}
                    >
                      <Text style={styles.suggestionChipText}>
                        {suggestion}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            </View>
          </View>
        )}

        {/* Loading State */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={THEME.primary} />
            <Text style={styles.loadingText}>Searching...</Text>
          </View>
        )}

        {/* Search Results */}
        {hasSearched && !loading && (
          <>
            {searchResults.length > 0 ? (
              <>
                <Text style={styles.resultsCount}>
                  Found {searchResults.length} result
                  {searchResults.length !== 1 ? 's' : ''}
                </Text>
                {searchResults.map((post) => (
                  <CalmPostCard
                    key={post.id}
                    post={post}
                    onResponse={handleResponse}
                    onSave={handleSave}
                    onViewThread={handleViewThread}
                    onPress={handlePostPress}
                    navigation={navigation}
                  />
                ))}
              </>
            ) : (
              <View style={styles.emptyWrapper}>
                <View style={styles.emptyAccentBar} />
                <View style={styles.empty}>
                  <Search size={64} color={THEME.textSecondary} opacity={0.3} />
                  <Text style={styles.emptyTitle}>No results found</Text>
                  <Text style={styles.emptyText}>
                    Try different keywords or check your spelling
                  </Text>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  backButton: {
    padding: 8,
  },
  searchBarWrapper: {
    flex: 1,
    position: 'relative',
  },
  searchAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    opacity: 0.6,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.surface,
    paddingHorizontal: 16,
    paddingLeft: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: THEME.text,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: THEME.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  // Filters
  filtersWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  filtersAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    opacity: 0.4,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: THEME.surface,
    padding: 12,
    paddingLeft: 16,
    borderRadius: 12,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: THEME.input,
  },
  filterChipActive: {
    backgroundColor: 'rgba(255, 99, 74, 0.15)',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.textSecondary,
  },
  filterChipTextActive: {
    color: THEME.primary,
  },
  content: {
    flex: 1,
  },
  // History
  historyWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  historyAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.6,
  },
  historySection: {
    backgroundColor: THEME.surface,
    padding: 18,
    paddingLeft: 22,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  historyTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: THEME.text,
  },
  clearButton: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.primary,
  },
  historyList: {
    gap: 12,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  historyItemText: {
    flex: 1,
    fontSize: 15,
    color: THEME.text,
  },
  // Suggestions
  suggestionsWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginTop: 8,
  },
  suggestionsAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.4,
  },
  suggestions: {
    backgroundColor: THEME.surface,
    padding: 18,
    paddingLeft: 22,
    borderRadius: 16,
  },
  suggestionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.textSecondary,
    marginBottom: 12,
  },
  suggestionsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: THEME.input,
  },
  suggestionChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: THEME.text,
  },
  // Loading
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 15,
    color: THEME.textSecondary,
    marginTop: 16,
    fontStyle: 'italic',
  },
  // Results
  resultsCount: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.textSecondary,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  // Empty State
  emptyWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginTop: 40,
  },
  emptyAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.4,
  },
  empty: {
    backgroundColor: THEME.surface,
    padding: 40,
    paddingLeft: 44,
    borderRadius: 16,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: THEME.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: THEME.textSecondary,
    textAlign: 'center',
  },
});
