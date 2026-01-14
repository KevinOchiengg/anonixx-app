import React from 'react'
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  View,
  StyleSheet,
} from 'react-native'

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
  const getVariantStyle = () => {
    switch (variant) {
      case 'secondary':
        return styles.secondary
      case 'outline':
        return styles.outline
      case 'ghost':
        return styles.ghost
      case 'danger':
        return styles.danger
      default:
        return styles.primary
    }
  }

  const getSizeStyle = () => {
    switch (size) {
      case 'small':
        return styles.small
      case 'large':
        return styles.large
      default:
        return styles.medium
    }
  }

  const isDisabled = disabled || loading

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.button,
        getVariantStyle(),
        getSizeStyle(),
        isDisabled && styles.disabled,
        style,
      ]}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'outline' ? '#a855f7' : '#ffffff'}
          size='small'
        />
      ) : (
        <View style={styles.content}>
          {icon && <View style={styles.icon}>{icon}</View>}
          <Text
            style={[
              styles.text,
              variant === 'outline' && styles.outlineText,
              size === 'small' && styles.smallText,
              size === 'large' && styles.largeText,
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: { borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#a855f7' },
  secondary: { backgroundColor: '#14b8a6' },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#a855f7',
  },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: '#ef4444' },
  small: { paddingVertical: 8, paddingHorizontal: 16 },
  medium: { paddingVertical: 12, paddingHorizontal: 24 },
  large: { paddingVertical: 16, paddingHorizontal: 32 },
  disabled: { opacity: 0.5 },
  content: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 8 },
  text: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  outlineText: { color: '#a855f7' },
  smallText: { fontSize: 14 },
  largeText: { fontSize: 18 },
})
