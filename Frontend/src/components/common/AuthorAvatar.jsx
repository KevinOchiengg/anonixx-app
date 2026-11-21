import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Mars, NonBinary, Venus } from 'lucide-react-native';

const GENDER_ICON = {
  male: { Icon: Mars, color: '#6FB1FF', label: 'Male' },
  female: { Icon: Venus, color: '#FF7AB8', label: 'Female' },
  nonbinary: { Icon: NonBinary, color: '#B89CFF', label: 'Non-binary' },
};

const withAlpha = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export default function AuthorAvatar({ uri, name, gender, size, initialStyle }) {
  if (uri) return <Image source={{ uri }} style={StyleSheet.absoluteFill} />;

  const g = GENDER_ICON[gender];
  if (!g) {
    return (
      <View style={styles.center}>
        <Text style={initialStyle}>{name?.[0]?.toUpperCase() || 'A'}</Text>
      </View>
    );
  }

  const { Icon, color, label } = g;
  return (
    <View
      style={[styles.center, { borderRadius: size / 2, backgroundColor: withAlpha(color, 0.16) }]}
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <Icon size={Math.round(size * 0.5)} color={color} strokeWidth={2.25} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
