import React from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  FlatList,
} from 'react-native';

interface SelectOption {
  label: string;
  value: string;
}

interface ThemedSelectModalProps {
  visible: boolean;
  title: string;
  options: SelectOption[];
  selectedValue?: string;
  loading?: boolean;
  emptyMessage?: string;
  onClose: () => void;
  onSelect: (option: SelectOption) => void;
}

export default function ThemedSelectModal({
  visible,
  title,
  options,
  selectedValue,
  loading = false,
  emptyMessage = 'No options available',
  onClose,
  onSelect,
}: ThemedSelectModalProps) {
  const renderItem = ({ item }: { item: SelectOption }) => {
    const isSelected = item.value === selectedValue;
    return (
      <TouchableOpacity
        style={[styles.optionRow, isSelected && styles.optionRowSelected]}
        onPress={() => onSelect(item)}
      >
        <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{item.label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color="#FF8C00" />
              <Text style={styles.stateText}>Loading...</Text>
            </View>
          ) : options.length === 0 ? (
            <View style={styles.centerState}>
              <Text style={styles.stateText}>{emptyMessage}</Text>
            </View>
          ) : (
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={renderItem}
              showsVerticalScrollIndicator={false}
              style={styles.list}
            />
          )}

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    padding: 14,
    maxHeight: '72%',
  },
  title: {
    color: '#ECEDEE',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  list: {
    maxHeight: 340,
  },
  optionRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#151718',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    marginBottom: 8,
  },
  optionRowSelected: {
    borderColor: '#FF8C00',
    backgroundColor: 'rgba(255, 140, 0, 0.12)',
  },
  optionText: {
    color: '#ECEDEE',
    fontSize: 14,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#FFB347',
    fontWeight: '700',
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  stateText: {
    color: '#8E8E93',
    fontSize: 14,
  },
  cancelButton: {
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#2A2C2E',
    paddingVertical: 11,
  },
  cancelButtonText: {
    color: '#ECEDEE',
    fontSize: 14,
    fontWeight: '600',
  },
});
