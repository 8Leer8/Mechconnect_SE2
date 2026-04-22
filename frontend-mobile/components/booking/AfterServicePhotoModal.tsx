import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { ThemedText } from '@/components/themed-text';

interface AfterServicePhotoModalProps {
  visible: boolean;
  mode?: 'before' | 'after';
  loading?: boolean;
  onClose: () => void;
  onSubmit: (photoUris: string[]) => void;
}

export default function AfterServicePhotoModal({
  visible,
  mode = 'after',
  loading = false,
  onClose,
  onSubmit,
}: AfterServicePhotoModalProps) {
  const [photoUris, setPhotoUris] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    setPhotoUris([]);
  }, [visible]);

  const ensureCameraPermission = async (): Promise<boolean> => {
    let permission = await ImagePicker.getCameraPermissionsAsync();

    if (permission.status !== 'granted') {
      permission = await ImagePicker.requestCameraPermissionsAsync();
    }

    if (permission.status === 'granted') {
      return true;
    }

    if (permission.canAskAgain) {
      return new Promise((resolve) => {
        Alert.alert(
          'Camera Permission Needed',
          'Camera access is required to take before/after service photos.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            {
              text: 'Ask Again',
              onPress: async () => {
                const retryPermission = await ImagePicker.requestCameraPermissionsAsync();
                resolve(retryPermission.status === 'granted');
              },
            },
          ]
        );
      });
    }

    Alert.alert(
      'Camera Access Blocked',
      'Camera permission is blocked for this app. Please enable it in settings, then try again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => {
            Linking.openSettings().catch(() => undefined);
          },
        },
      ]
    );
    return false;
  };

  const pickFromCamera = async () => {
    const hasPermission = await ensureCameraPermission();
    if (!hasPermission) return;

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      const capturedUri = result.assets[0].uri;
      Alert.alert(
        'Use this photo?',
        'Confirm this capture before adding it to the job record.',
        [
          { text: 'Retake', style: 'cancel' },
          {
            text: 'Use Photo',
            onPress: () => {
              setPhotoUris((prev) => [...prev, capturedUri]);
            },
          },
        ]
      );
    }
  };

  const handleSubmit = () => {
    if (!photoUris.length || loading) return;
    onSubmit(photoUris);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={styles.sheet}>
            <View style={styles.headerRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <FontAwesome name="camera" size={18} color="#FF8C00" />
                <ThemedText style={styles.title}>
                  {mode === 'before' ? 'Before-Service Photos Required' : 'After-Service Photos Required'}
                </ThemedText>
              </View>
              <TouchableOpacity onPress={onClose} disabled={loading}>
                <FontAwesome name="times" size={20} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <ThemedText style={styles.subtitle}>
              {mode === 'before'
                ? 'Take photos first before starting the job. Added photos are locked and cannot be removed.'
                : 'Take photos before finishing the job. Added photos are locked and cannot be removed.'}
            </ThemedText>

            {photoUris.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewList}>
                {photoUris.map((uri, idx) => (
                  <View key={`${uri}-${idx}`} style={styles.previewWrap}>
                    <Image source={{ uri }} style={styles.previewImage} contentFit="cover" />
                    <View style={styles.photoNumberBadge}>
                      <ThemedText style={styles.photoNumberText}>{idx + 1}</ThemedText>
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.placeholderWrap}>
                <FontAwesome name="image" size={30} color="#6C6C70" />
                <ThemedText style={styles.placeholderText}>No photos captured yet</ThemedText>
              </View>
            )}

            <View style={styles.pickerRow}>
              <TouchableOpacity style={[styles.secondaryButton, { flex: 0 }]} onPress={pickFromCamera} disabled={loading}>
                <FontAwesome name="camera" size={14} color="#FF8C00" />
                <ThemedText style={styles.secondaryButtonText}>Take Photo</ThemedText>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, (!photoUris.length || loading) && styles.primaryButtonDisabled]}
              onPress={handleSubmit}
              disabled={!photoUris.length || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <FontAwesome name="check" size={14} color="#fff" />
                  <ThemedText style={styles.primaryButtonText}>
                    {mode === 'before' ? 'Upload & Start Job' : 'Upload & Complete'}
                  </ThemedText>
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
  previewList: {
    gap: 10,
    paddingBottom: 6,
    marginBottom: 10,
  },
  previewWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    backgroundColor: '#111214',
    width: 170,
    height: 150,
  },
  previewImage: {
    width: 170,
    height: 150,
  },
  photoNumberBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#111214D9',
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  photoNumberText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
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
