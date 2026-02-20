import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Coins } from 'lucide-react-native';

const COIN_COLOR = '#fbbf24'; // Gold color for coins

export default function CoinBadge({ amount, size = 'medium' }) {
  const getSizeStyle = () => {
    switch (size) {
      case 'small':
        return styles.small;
      case 'large':
        return styles.large;
      default:
        return styles.medium;
    }
  };

  const getIconSize = () => {
    switch (size) {
      case 'small':
        return 14;
      case 'large':
        return 22;
      default:
        return 18;
    }
  };

  return (
    <View style={[styles.container, getSizeStyle()]}>
      <Coins size={getIconSize()} color={COIN_COLOR} />
      <Text
        style={[
          styles.text,
          size === 'large' && styles.largeText,
          size === 'small' && styles.smallText,
        ]}
      >
        {amount}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
    borderRadius: 20,
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  small: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
  },
  medium: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  large: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
  },
  text: {
    color: COIN_COLOR,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 6,
  },
  smallText: {
    fontSize: 12,
    marginLeft: 4,
  },
  largeText: {
    fontSize: 16,
    marginLeft: 8,
  },
});
