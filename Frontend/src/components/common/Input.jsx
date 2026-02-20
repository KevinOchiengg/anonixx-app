import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  input: 'rgba(30, 35, 45, 0.7)',
  border: 'rgba(255,255,255,0.05)',
  error: '#ef4444',
};

export default function Input({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  error = null,
  icon = null,
  multiline = false,
  showAccentBar = false,
  ...props
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputWrapper}>
        {showAccentBar && (
          <View
            style={[
              styles.accentBar,
              error && styles.accentBarError,
              isFocused && styles.accentBarFocused,
            ]}
          />
        )}
        <View
          style={[styles.inputContainer, error && styles.inputContainerError]}
        >
          {icon && <View style={styles.iconLeft}>{icon}</View>}
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={THEME.textSecondary}
            secureTextEntry={secureTextEntry && !showPassword}
            multiline={multiline}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            style={[
              styles.input,
              icon && styles.inputWithIcon,
              multiline && styles.textArea,
              secureTextEntry && styles.inputWithRightIcon,
            ]}
            {...props}
          />
          {secureTextEntry && (
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.iconRight}
            >
              {showPassword ? (
                <EyeOff size={20} color={THEME.textSecondary} />
              ) : (
                <Eye size={20} color={THEME.textSecondary} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
      {error && (
        <View style={styles.errorWrapper}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    color: THEME.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    position: 'relative',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    opacity: 0.4,
    zIndex: 1,
  },
  accentBarFocused: {
    opacity: 0.8,
  },
  accentBarError: {
    backgroundColor: THEME.error,
    opacity: 0.8,
  },
  inputContainer: {
    position: 'relative',
    backgroundColor: THEME.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  inputContainerError: {
    borderColor: THEME.error,
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  input: {
    color: THEME.text,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
  },
  inputWithIcon: {
    paddingLeft: 52,
  },
  inputWithRightIcon: {
    paddingRight: 52,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  iconLeft: {
    position: 'absolute',
    left: 16,
    top: 14,
    zIndex: 10,
  },
  iconRight: {
    position: 'absolute',
    right: 16,
    top: 14,
  },
  errorWrapper: {
    marginTop: 6,
    marginLeft: 4,
  },
  errorText: {
    color: THEME.error,
    fontSize: 12,
    fontWeight: '500',
  },
});
