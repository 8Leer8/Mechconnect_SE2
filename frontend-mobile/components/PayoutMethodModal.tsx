import React, { useEffect, useMemo, useState } from 'react';
import { Modal, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';

const METHOD_OPTIONS = [
  { label: 'GCash', value: 'gcash' },
  { label: 'Maya', value: 'maya' },
];

type PayoutMethod = 'gcash' | 'maya' | '';

interface PayoutMethodModalProps {
  visible: boolean;
  initialMethod?: PayoutMethod;
  initialNumber?: string;
  onClose: () => void;
  onSave: (method: PayoutMethod, number: string) => void;
}

export default function PayoutMethodModal({
  visible,
  initialMethod = '',
  initialNumber = '',
  onClose,
  onSave,
}: PayoutMethodModalProps) {
  const [method, setMethod] = useState<PayoutMethod>(initialMethod);
  const [number, setNumber] = useState(initialNumber);
  const [error, setError] = useState('');

  const stripPrefix = (value: string) => {
    const cleaned = String(value || '').replace(/\s+/g, '').replace(/[^\d+]/g, '');
    const withoutCountry = cleaned.replace(/^\+?63/, '');
    return withoutCountry.startsWith('0') ? withoutCountry.slice(1) : withoutCountry;
  };

  useEffect(() => {
    if (visible) {
      setMethod(initialMethod || '');
      setNumber(stripPrefix(initialNumber || ''));
      setError('');
    }
  }, [visible, initialMethod, initialNumber]);

  const methodLabel = useMemo(() => {
    const match = METHOD_OPTIONS.find((item) => item.value === method);
    return match?.label || 'Select Method';
  }, [method]);

  const handleSave = () => {
    if (!method) {
      setError('Please select a payout method.');
      return;
    }
    if (!number.trim()) {
      setError('Please enter your payout number.');
      return;
    }
    onSave(method, stripPrefix(number.trim()));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.overlayBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <ThemedText style={styles.title}>Add Cashout Number</ThemedText>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <FontAwesome name="times" size={16} color="#C7C7CC" />
            </TouchableOpacity>
          </View>

          <ThemedText style={styles.label}>Payout Method</ThemedText>
          <View style={styles.methodRow}>
            {METHOD_OPTIONS.map((item) => {
              const isActive = method === item.value;
              return (
                <TouchableOpacity
                  key={item.value}
                  onPress={() => {
                    setMethod(item.value as PayoutMethod);
                    setError('');
                  }}
                  style={[styles.methodChip, isActive && styles.methodChipActive]}
                >
                  <ThemedText style={[styles.methodText, isActive && styles.methodTextActive]}>
                    {item.label}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
          <ThemedText style={styles.methodHint}>{methodLabel}</ThemedText>

          <ThemedText style={styles.label}>Payout Number</ThemedText>
          <View style={styles.inputRow}>
            <View style={styles.prefixBox}>
              <ThemedText style={styles.prefixText}>+63</ThemedText>
            </View>
            <TextInput
              style={[styles.input, styles.inputWithPrefix]}
              value={number}
              onChangeText={(text) => {
                setNumber(text.replace(/[^\d]/g, ''));
                setError('');
              }}
              placeholder="9XXXXXXXXX"
              placeholderTextColor="#8E8E93"
              keyboardType="number-pad"
            />
          </View>

          {!!error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <ThemedText style={styles.saveBtnText}>Save</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayBackdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#1A1C1E',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2A2A2E',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A2A2E',
  },
  label: {
    fontSize: 12,
    color: '#C7C7CC',
    marginBottom: 6,
    fontWeight: '600',
  },
  methodRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 6,
  },
  methodChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2A2A2E',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#151515',
  },
  methodChipActive: {
    borderColor: '#FF8C00',
    backgroundColor: 'rgba(255, 140, 0, 0.12)',
  },
  methodText: {
    color: '#C7C7CC',
    fontWeight: '700',
  },
  methodTextActive: {
    color: '#FF8C00',
  },
  methodHint: {
    color: '#8E8E93',
    fontSize: 11,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#2A2A2E',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    backgroundColor: '#151515',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  prefixBox: {
    borderWidth: 1,
    borderColor: '#2A2A2E',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#151515',
    marginRight: 8,
  },
  prefixText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  inputWithPrefix: {
    flex: 1,
  },
  errorText: {
    color: '#FF6B5C',
    fontSize: 12,
    marginTop: 8,
  },
  saveBtn: {
    marginTop: 14,
    backgroundColor: '#FF8C00',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#121212',
    fontWeight: '700',
  },
});
