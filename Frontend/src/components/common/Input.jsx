import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import T from '../../utils/theme';
import { RADIUS, FONT, rp, rs } from '../../utils/responsive';

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
  const [isFocused,    setIsFocused]    = useState(false);

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputWrapper}>
        {showAccentBar && (
          <View style={[
            styles.accentBar,
            error     && styles.accentBarError,
            isFocused && styles.accentBarFocused,
          ]} />
        )}
        <View style={[styles.inputContainer, error && styles.inputContainerError]}>
          {icon && <View style={styles.iconLeft}>{icon}</View>}
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={T.textMuted}
            secureTextEntry={secureTextEntry && !showPassword}
            multiline={multiline}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            style={[
              styles.input,
              icon           && styles.inputWithIcon,
              multiline      && styles.textArea,
              secureTextEntry && styles.inputWithRightIcon,
            ]}
            {...props}
          />
          {secureTextEntry && (
            <TouchableOpacity
              onPress={() => setShowPassword(p => !p)}
              style={styles.iconRight}
            >
              {showPassword
                ? <EyeOff size={rs(20)} color={T.textMuted} />
                : <Eye    size={rs(20)} color={T.textMuted} />
              }
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
    marginBottom: rp(16),
  },
  label: {
    color:         T.text,
    fontSize:      FONT.xs,
    fontWeight:    '700',
    marginBottom:  rp(8),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    position: 'relative',
  },
  accentBar: {
    position:              'absolute',
    left:                  0,
    top:                   0,
    bottom:                0,
    width:                 rp(4),
    backgroundColor:       T.primary,
    borderTopLeftRadius:   RADIUS.md,
    borderBottomLeftRadius: RADIUS.md,
    opacity:               0.4,
    zIndex:                1,
  },
  accentBarFocused: { opacity: 0.9 },
  accentBarError:   { backgroundColor: T.error, opacity: 0.9 },

  inputContainer: {
    position:         'relative',
    backgroundColor:  T.surface,
    borderRadius:     RADIUS.md,
    borderWidth:      1,
    borderColor:      T.border,
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: rp(2) },
    shadowOpacity:    0.1,
    shadowRadius:     rp(4),
    elevation:        2,
  },
  inputContainerError: {
    borderColor:     T.error,
    backgroundColor: 'rgba(239,68,68,0.05)',
  },
  input: {
    color:            T.text,
    paddingHorizontal: rp(16),
    paddingVertical:   rp(13),
    fontSize:          FONT.md,
    minHeight:         rp(48),
  },
  inputWithIcon:      { paddingLeft:  rp(52) },
  inputWithRightIcon: { paddingRight: rp(52) },
  textArea: {
    minHeight:       rp(100),
    paddingTop:      rp(12),
    textAlignVertical: 'top',
  },
  iconLeft: {
    position: 'absolute',
    left:     rp(16),
    top:      rp(14),
    zIndex:   10,
  },
  iconRight: {
    position: 'absolute',
    right:    rp(16),
    top:      rp(14),
  },
  errorWrapper: {
    marginTop:  rp(6),
    marginLeft: rp(4),
  },
  errorText: {
    color:      T.error,
    fontSize:   FONT.xs,
    fontWeight: '500',
  },
});
