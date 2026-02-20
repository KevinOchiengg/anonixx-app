import React, { useMemo } from 'react';
import {
  View,
  ActivityIndicator,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';

const { height, width } = Dimensions.get('window');

const THEME = {
  background: '#0b0f18',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
};

// Optional: Starry Background Component
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

export default function LoadingSpinner({
  message = 'Loading...',
  size = 'large',
  showBackground = true,
}) {
  return (
    <View style={styles.container}>
      {showBackground && <StarryBackground />}
      <View style={styles.content}>
        <ActivityIndicator size={size} color={THEME.primary} />
        {message && <Text style={styles.message}>{message}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: THEME.background,
  },
  content: {
    alignItems: 'center',
    zIndex: 10,
  },
  message: {
    color: THEME.textSecondary,
    marginTop: 16,
    fontSize: 15,
    fontWeight: '500',
    fontStyle: 'italic',
  },
});
