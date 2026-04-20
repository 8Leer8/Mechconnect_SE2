import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { ThemedText } from '@/components/themed-text';

interface AfterServicePhotoModalProps {
  visible: boolean;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (photoUri: string) => void;
}

export default function AfterServicePhotoModal({
  visible,
  loading = false,
  onClose,
  onSubmit,
}: AfterServicePhotoModalProps) {
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPhotoUri(null);
  }, [visible]);

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleSubmit = () => {
    if (!photoUri || loading) return;
    onSubmit(photoUri);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={styles.sheet}>
            <View style={styles.headerRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <FontAwesome name="camera" size={18} color="#FF8C00" />
                <ThemedText style={styles.title}>After-Service Photo Required</ThemedText>
              </View>
              <TouchableOpacity onPress={onClose} disabled={loading}>
                <FontAwesome name="times" size={20} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <ThemedText style={styles.subtitle}>
              Take and upload an after-service photo before finishing the job.
            </ThemedText>

            {photoUri ? (
              <View style={styles.previewWrap}>
                <Image source={{ uri: photoUri }} style={styles.previewImage} contentFit="cover" />
                <TouchableOpacity style={styles.removeButton} onPress={() => setPhotoUri(null)} disabled={loading}>
                  <FontAwesome name="times-circle" size={24} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.placeholderWrap}>
                <FontAwesome name="image" size={30} color="#6C6C70" />
                <ThemedText style={styles.placeholderText}>No photo selected yet</ThemedText>
              </View>
            )}

            <View style={styles.pickerRow}>
              <TouchableOpacity style={[styles.secondaryButton, { flex: 0 }]} onPress={pickFromCamera} disabled={loading}>
                <FontAwesome name="camera" size={14} color="#FF8C00" />
                <ThemedText style={styles.secondaryButtonText}>Take Photo</ThemedText>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, (!photoUri || loading) && styles.primaryButtonDisabled]}
              onPress={handleSubmit}
              disabled={!photoUri || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <FontAwesome name="check" size={14} color="#fff" />
                  <ThemedText style={styles.primaryButtonText}>Upload & Complete</ThemedText>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    backgroundColor: '#1A1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 22,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 8,
    color: '#8E8E93',
    marginBottom: 12,
  },
  previewWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    backgroundColor: '#111214',
    marginBottom: 10,
  },
  previewImage: {
    width: '100%',
    height: 200,
  },
  removeButton: {
    position: 'absolute',
    right: 8,
    top: 8,
    backgroundColor: '#111214CC',
    borderRadius: 20,
  },
  placeholderWrap: {
    height: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    backgroundColor: '#111214',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  placeholderText: {
    color: '#8E8E93',
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FF8C0040',
    backgroundColor: '#FF8C0010',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#FF8C00',
    fontWeight: '700',
  },
  primaryButton: {
    borderRadius: 12,
    backgroundColor: '#FF8C00',
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
});
