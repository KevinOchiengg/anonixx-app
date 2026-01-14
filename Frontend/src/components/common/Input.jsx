import React, { useState } from 'react'
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { Eye, EyeOff } from 'lucide-react-native'

export default function Input({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  error = null,
  icon = null,
  multiline = false,
  ...props
}) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputWrapper}>
        {icon && <View style={styles.iconLeft}>{icon}</View>}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor='#6b7280'
          secureTextEntry={secureTextEntry && !showPassword}
          multiline={multiline}
          style={[
            styles.input,
            error && styles.inputError,
            icon && styles.inputWithIcon,
            multiline && styles.textArea,
          ]}
          {...props}
        />
        {secureTextEntry && (
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={styles.iconRight}
          >
            {showPassword ? (
              <EyeOff size={20} color='#6b7280' />
            ) : (
              <Eye size={20} color='#6b7280' />
            )}
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { color: '#ffffff', fontSize: 14, fontWeight: '500', marginBottom: 8 },
  inputWrapper: { position: 'relative' },
  input: {
    backgroundColor: '#16213e',
    color: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    fontSize: 16,
  },
  inputError: { borderColor: '#ef4444' },
  inputWithIcon: { paddingLeft: 48 },
  textArea: { minHeight: 100, paddingTop: 12, textAlignVertical: 'top' },
  iconLeft: { position: 'absolute', left: 16, top: 16, zIndex: 10 },
  iconRight: { position: 'absolute', right: 16, top: 16 },
  errorText: { color: '#ef4444', fontSize: 12, marginTop: 4 },
})
