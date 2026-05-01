import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  View,
  StyleSheet,
} from 'react-native';
import T from '../../utils/theme';
import { RADIUS, FONT, rp, BUTTON_HEIGHT } from '../../utils/responsive';

export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  icon = null,
  style = {},
}) {
  const variantStyle = {
    primary:   styles.primary,
    secondary: styles.secondary,
    outline:   styles.outline,
    ghost:     styles.ghost,
    danger:    styles.danger,
  }[variant] ?? styles.primary;

  const sizeStyle = {
    small:  styles.small,
    medium: styles.medium,
    large:  styles.large,
  }[size] ?? styles.medium;

  const textColor =
    variant === 'outline' ? T.primary
    : variant === 'ghost'  ? T.text
    : '#ffffff';

  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      style={[styles.button, variantStyle, sizeStyle, isDisabled && styles.disabled, style]}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'outline' || variant === 'ghost' ? T.primary : '#ffffff'}
          size="small"
        />
      ) : (
        <View style={styles.content}>
          {icon && <View style={styles.icon}>{icon}</View>}
          <Text style={[
            styles.text,
            { color: textColor },
            size === 'small' && styles.smallText,
            size === 'large' && styles.largeText,
          ]}>
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius:   RADIUS.md,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Variants
  primary: {
    backgroundColor: T.primary,
    shadowColor:     T.primary,
    shadowOffset:    { width: 0, height: rp(4) },
    shadowOpacity:   0.3,
    shadowRadius:    rp(8),
    elevation:       4,
  },
  secondary: {
    backgroundColor: T.success,
    shadowColor:     T.success,
    shadowOffset:    { width: 0, height: rp(4) },
    shadowOpacity:   0.3,
    shadowRadius:    rp(8),
    elevation:       4,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth:     1.5,
    borderColor:     T.primary,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: T.danger,
    shadowColor:     T.danger,
    shadowOffset:    { width: 0, height: rp(4) },
    shadowOpacity:   0.3,
    shadowRadius:    rp(8),
    elevation:       4,
  },

  // Sizes
  small: {
    paddingVertical:   rp(8),
    paddingHorizontal: rp(16),
  },
  medium: {
    height:            BUTTON_HEIGHT,
    paddingHorizontal: rp(24),
  },
  large: {
    paddingVertical:   rp(18),
    paddingHorizontal: rp(32),
  },

  disabled: { opacity: 0.5 },

  content: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  icon: { marginRight: rp(8) },
  text: {
    fontSize:   FONT.md,
    fontWeight: '700',
    textAlign:  'center',
  },
  smallText: { fontSize: FONT.sm },
  largeText: { fontSize: FONT.lg },
});
