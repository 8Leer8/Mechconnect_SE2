import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';

interface MechanicRatingModalProps {
  visible: boolean;
  mechanicName?: string;
  loading?: boolean;
  initialRating?: number;
  initialComment?: string;
  onClose: () => void;
  onSkip: () => void;
  onSubmit: (payload: { rating: number; comment: string }) => void;
}

export default function MechanicRatingModal({
  visible,
  mechanicName,
  loading = false,
  initialRating,
  initialComment,
  onClose,
  onSkip,
  onSubmit,
}: MechanicRatingModalProps) {
  const [rating, setRating] = useState<number>(initialRating && initialRating >= 1 ? initialRating : 0);
  const [comment, setComment] = useState(initialComment || '');

  useEffect(() => {
    if (!visible) return;
    setRating(initialRating && initialRating >= 1 ? initialRating : 0);
    setComment(initialComment || '');
  }, [visible, initialRating, initialComment]);

  const canSubmit = rating >= 1 && !loading;

  const title = useMemo(() => {
    if (mechanicName && mechanicName.trim()) {
      return `Rate ${mechanicName}`;
    }
    return 'Rate your mechanic';
  }, [mechanicName]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ThemedText style={styles.title}>{title}</ThemedText>
          <ThemedText style={styles.subtitle}>You can skip this and rate later.</ThemedText>

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((value) => (
              <TouchableOpacity
                key={value}
                style={styles.starButton}
                onPress={() => setRating(value)}
                disabled={loading}
                activeOpacity={0.85}
              >
                <FontAwesome
                  name={value <= rating ? 'star' : 'star-o'}
                  size={30}
                  color={value <= rating ? '#FFD60A' : '#8E8E93'}
                />
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.commentInput}
            multiline
            numberOfLines={4}
            maxLength={500}
            editable={!loading}
            placeholder="Optional message..."
            placeholderTextColor="#8E8E93"
            value={comment}
            onChangeText={setComment}
          />

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.skipBtn} onPress={onSkip} disabled={loading}>
              <ThemedText style={styles.skipText}>Skip</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit ? styles.submitBtnDisabled : null]}
              onPress={() => onSubmit({ rating, comment: comment.trim() })}
              disabled={!canSubmit}
            >
              {loading ? (
                <ActivityIndicator color="#111214" />
              ) : (
                <ThemedText style={styles.submitText}>Submit Rating</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  sheet: {
    backgroundColor: '#1A1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#3A3D40',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ECEDEE',
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 12,
    color: '#8E8E93',
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  starButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  commentInput: {
    minHeight: 96,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    backgroundColor: '#151718',
    color: '#ECEDEE',
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  skipBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3D40',
    backgroundColor: '#1A1C1E',
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipText: {
    color: '#ECEDEE',
    fontWeight: '700',
  },
  submitBtn: {
    flex: 2,
    borderRadius: 12,
    backgroundColor: '#FFD60A',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: '#ECEDEE',
    fontWeight: '800',
  },
});
