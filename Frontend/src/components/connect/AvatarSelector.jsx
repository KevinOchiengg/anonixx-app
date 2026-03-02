import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { Check } from 'lucide-react-native';

// ─────────────────────────────────────────────
// AURA CONFIG
// ─────────────────────────────────────────────
export const AURAS = [
  {
    id: 'purple_glow',
    label: 'Purple Glow',
    color: '#9B59B6',
    glow: 'rgba(155, 89, 182, 0.4)',
  },
  {
    id: 'red_shadow',
    label: 'Red Shadow',
    color: '#E74C3C',
    glow: 'rgba(231, 76, 60, 0.4)',
  },
  {
    id: 'green_mist',
    label: 'Green Mist',
    color: '#2ECC71',
    glow: 'rgba(46, 204, 113, 0.4)',
  },
  {
    id: 'blue_void',
    label: 'Blue Void',
    color: '#3498DB',
    glow: 'rgba(52, 152, 219, 0.4)',
  },
  {
    id: 'dark_phantom',
    label: 'Dark Phantom',
    color: '#7F8C8D',
    glow: 'rgba(127, 140, 141, 0.4)',
  },
  {
    id: 'coral_flame',
    label: 'Coral Flame',
    color: '#FF634A',
    glow: 'rgba(255, 99, 74, 0.4)',
  },
];

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  surfaceDark: '#10131c',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.07)',
  primary: '#FF634A',
};

// ─────────────────────────────────────────────
// AURA ORB — single selectable orb
// ─────────────────────────────────────────────
function AuraOrb({ aura, selected, onSelect }) {
  return (
    <TouchableOpacity
      onPress={() => onSelect(aura.id)}
      activeOpacity={0.8}
      style={styles.orbWrapper}
    >
      {/* Glow ring when selected */}
      {selected && (
        <View
          style={[
            styles.glowRing,
            { borderColor: aura.color, shadowColor: aura.color },
          ]}
        />
      )}

      {/* Orb */}
      <View
        style={[
          styles.orb,
          { backgroundColor: aura.color },
          selected && {
            shadowColor: aura.color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 12,
            elevation: 8,
          },
        ]}
      >
        {selected && <Check size={16} color="#fff" strokeWidth={3} />}
      </View>

      {/* Label */}
      <Text
        style={[
          styles.orbLabel,
          { color: selected ? aura.color : THEME.textSecondary },
        ]}
      >
        {aura.label}
      </Text>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────
// AVATAR SELECTOR — inline grid (use in settings/profile)
// ─────────────────────────────────────────────
export function AvatarSelector({ selectedAura, onSelect }) {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Choose Your Aura</Text>
      <Text style={styles.sectionSubtitle}>
        This is how others will sense your presence
      </Text>

      <View style={styles.grid}>
        {AURAS.map((aura) => (
          <AuraOrb
            key={aura.id}
            aura={aura}
            selected={selectedAura === aura.id}
            onSelect={onSelect}
          />
        ))}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────
// AVATAR SELECTOR MODAL — use when picking aura inline
// e.g. during CreateBroadcast or onboarding
// ─────────────────────────────────────────────
export function AvatarSelectorModal({
  visible,
  selectedAura,
  onSelect,
  onClose,
}) {
  const [localSelection, setLocalSelection] = useState(selectedAura);

  const handleConfirm = () => {
    onSelect(localSelection);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          {/* Handle */}
          <View style={styles.handle} />

          <Text style={styles.modalTitle}>Your Aura</Text>
          <Text style={styles.modalSubtitle}>
            This is how others will sense your presence — no photos, just
            energy.
          </Text>

          <View style={styles.grid}>
            {AURAS.map((aura) => (
              <AuraOrb
                key={aura.id}
                aura={aura}
                selected={localSelection === aura.id}
                onSelect={setLocalSelection}
              />
            ))}
          </View>

          <TouchableOpacity
            onPress={handleConfirm}
            style={styles.confirmButton}
            activeOpacity={0.85}
          >
            <Text style={styles.confirmButtonText}>Confirm Aura</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// AURA PREVIEW — small display-only dot + label
// Use in feeds and chat headers
// ─────────────────────────────────────────────
export function AuraPreview({ auraId, size = 'sm' }) {
  const aura = AURAS.find((a) => a.id === auraId) || AURAS[0];
  const dotSize = size === 'lg' ? 18 : size === 'md' ? 14 : 10;

  return (
    <View style={previewStyles.row}>
      <View
        style={[
          previewStyles.dot,
          {
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: aura.color,
            shadowColor: aura.color,
          },
        ]}
      />
      {size !== 'sm' && (
        <Text style={[previewStyles.label, { color: aura.color }]}>
          {aura.label}
        </Text>
      )}
    </View>
  );
}

const previewStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: THEME.textSecondary,
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 8,
  },
  orbWrapper: {
    width: '30%',
    alignItems: 'center',
    gap: 8,
  },
  glowRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 6,
  },
  orb: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: THEME.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: THEME.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 14,
    color: THEME.textSecondary,
    marginBottom: 24,
    lineHeight: 20,
  },
  confirmButton: {
    backgroundColor: THEME.primary,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
