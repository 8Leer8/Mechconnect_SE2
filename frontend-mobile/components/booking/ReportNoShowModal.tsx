import React from 'react';
import { ActivityIndicator, Modal, TouchableOpacity, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';

interface ReportNoShowModalProps {
  visible: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ReportNoShowModal({
  visible,
  loading = false,
  onCancel,
  onConfirm,
}: ReportNoShowModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!loading) onCancel();
      }}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 20 }}>
        <View
          style={{
            backgroundColor: '#1A1C1E',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#2A2C2E',
            padding: 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: '#FF6B5C22',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
              }}
            >
              <FontAwesome name="exclamation-triangle" size={16} color="#FF6B5C" />
            </View>
            <ThemedText style={{ color: '#ECEDEE', fontSize: 20, fontWeight: '700' }}>
              Report Mechanic No-Show
            </ThemedText>
          </View>

          <ThemedText style={{ color: '#B7BBC1', fontSize: 15, lineHeight: 22, marginBottom: 16 }}>
            This will cancel the current booking, apply anti-abuse checks, and create an auto-rescue broadcast request.
          </ThemedText>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={{
                flex: 1,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#3A3A3C',
                backgroundColor: '#2C2C2E',
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onPress={onCancel}
              disabled={loading}
            >
              <ThemedText style={{ color: '#ECEDEE', fontWeight: '700' }}>Not now</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flex: 1,
                borderRadius: 10,
                backgroundColor: '#FF6B5C',
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: loading ? 0.8 : 1,
              }}
              onPress={onConfirm}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <ThemedText style={{ color: '#FFFFFF', fontWeight: '700' }}>Report No-Show</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
