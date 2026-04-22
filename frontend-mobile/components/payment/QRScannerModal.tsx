import React, { useEffect, useState } from 'react';
import { Alert, Linking, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { FontAwesome } from '@expo/vector-icons';

import { API_URL } from '@/config';
import { ThemedText } from '@/components/themed-text';

export interface QRScanResult {
  token: string;
  booking_id: number;
  amount: string;
  mechanic_name: string;
  booking_number: string;
}

interface QRScannerModalProps {
  visible: boolean;
  bookingId: number;
  onClose: () => void;
  onScanSuccess: (scanData: QRScanResult) => void;
}

export default function QRScannerModal({ visible, bookingId, onClose, onScanSuccess }: QRScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setScanning(true);
    requestPermission();
  }, [visible, requestPermission]);

  const handleScan = async ({ data }: { data: string }) => {
    if (!scanning) return;
    setScanning(false);

    try {
      const response = await fetch(`${API_URL}/bookings/payments/qr/scan/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: data }),
      });

      const rawPayload: unknown = await response.json().catch(() => ({}));
      const payload: Record<string, unknown> =
        typeof rawPayload === 'object' && rawPayload !== null
          ? (rawPayload as Record<string, unknown>)
          : {};
      const errorMessage = typeof payload.error === 'string' ? payload.error : 'Invalid QR code';
      if (!response.ok) {
        throw new Error(errorMessage);
      }

      const scanData: QRScanResult = {
        token: typeof payload.token === 'string' ? payload.token : '',
        booking_id: typeof payload.booking_id === 'number' ? payload.booking_id : 0,
        amount: typeof payload.amount === 'string' ? payload.amount : '0',
        mechanic_name: typeof payload.mechanic_name === 'string' ? payload.mechanic_name : '',
        booking_number: typeof payload.booking_number === 'string' ? payload.booking_number : '',
      };

      if (!scanData.token || !scanData.booking_id) {
        throw new Error('Invalid QR code response');
      }
      if (Number(bookingId) > 0 && Number(scanData.booking_id) !== Number(bookingId)) {
        throw new Error('This QR belongs to a different booking.');
      }

      onScanSuccess(scanData);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to scan QR code';
      Alert.alert('QR Scan Error', message);
      setScanning(true);
    }
  };

  if (!visible) return null;

  if (!permission || !permission.granted) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.permissionRoot}>
          <View style={styles.permissionCard}>
            <ThemedText style={styles.permissionTitle}>Camera Access Needed</ThemedText>
            <ThemedText style={styles.permissionText}>
              Camera access is required to scan the mechanic QR code.
            </ThemedText>

            <TouchableOpacity style={styles.actionButton} onPress={requestPermission}>
              <ThemedText style={styles.actionText}>Allow Camera</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={() => Linking.openSettings()}>
              <ThemedText style={styles.secondaryText}>Open Settings</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
              <ThemedText style={styles.secondaryText}>Close</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose}>
            <FontAwesome name="times" size={22} color="#ECEDEE" />
          </TouchableOpacity>
          <ThemedText style={styles.title}>Scan Mechanic QR Code</ThemedText>
          <View style={{ width: 22 }} />
        </View>

        <CameraView style={styles.camera} onBarcodeScanned={scanning ? handleScan : undefined} />

        <View pointerEvents="none" style={styles.overlay}>
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
        </View>

        <View style={styles.bottomBar}>
          <ThemedText style={styles.hintText}>Point your camera at the mechanic QR code</ThemedText>
          <TouchableOpacity style={styles.backButton} onPress={onClose}>
            <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    height: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#151718',
  },
  title: {
    color: '#ECEDEE',
    fontWeight: '700',
    fontSize: 16,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: '#FF8C00',
  },
  topLeft: {
    left: 0,
    top: 0,
    borderLeftWidth: 4,
    borderTopWidth: 4,
    borderTopLeftRadius: 10,
  },
  topRight: {
    right: 0,
    top: 0,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderTopRightRadius: 10,
  },
  bottomLeft: {
    left: 0,
    bottom: 0,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
    borderBottomLeftRadius: 10,
  },
  bottomRight: {
    right: 0,
    bottom: 0,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderBottomRightRadius: 10,
  },
  bottomBar: {
    padding: 18,
    backgroundColor: '#151718',
  },
  hintText: {
    color: '#9BA1A6',
    textAlign: 'center',
  },
  backButton: {
    marginTop: 12,
    alignSelf: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3A3D40',
    paddingVertical: 9,
    paddingHorizontal: 18,
    backgroundColor: '#1A1C1E',
  },
  backButtonText: {
    color: '#ECEDEE',
    fontWeight: '700',
  },
  permissionRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  permissionCard: {
    width: '86%',
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    padding: 16,
  },
  permissionTitle: {
    color: '#ECEDEE',
    fontWeight: '800',
    fontSize: 18,
  },
  permissionText: {
    color: '#9BA1A6',
    marginTop: 8,
    marginBottom: 16,
  },
  actionButton: {
    backgroundColor: '#FF8C00',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  actionText: {
    color: '#1A1C1E',
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#2A2C2E',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryText: {
    color: '#ECEDEE',
    fontWeight: '700',
  },
});